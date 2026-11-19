#!/usr/bin/env python3
"""Motor local de IA de Sampled Head (Windows y Mac).

Lo arranca el programa de escritorio (shared.js) con el Python de Documentos/SampledHead/Motor/venv.
Escucha solo en 127.0.0.1. Cada trabajo se ejecuta en un hilo y se consulta su progreso.

  POST /run   {task, input, out_dir, params}  ->  {id}
  GET  /job/<id>                              ->  {status, stage, progress, result|error, device}
  GET  /status                                ->  {device, parts}

Tareas
  separate  stems con audio-separator: BS-RoFormer / Mel-RoFormer (voz), htdemucs_ft (4), htdemucs_6s (guitarra, piano)
  sam       un sonido descrito con texto con SAM Audio (sam-audio-infer)
  lyrics    letra con el tiempo de cada palabra (faster-whisper large-v3); alineado con una letra dada
  notes     notas MIDI de cualquier instrumento (MuScriptor)
"""
import argparse, json, os, shutil, subprocess, sys, threading, time, traceback, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODELS = os.environ.get('SH_MODELS') or os.path.join(os.path.expanduser('~'), 'Documents', 'SampledHead', 'Modelos')
JOBS = {}
LOCK = threading.Lock()
GPU_LOCK = threading.Lock()          # un trabajo pesado cada vez: la memoria de la tarjeta no da para dos
_cache = {}


def device():
    try:
        import torch
        if torch.cuda.is_available():
            return 'cuda'
        if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
            return 'mps'
    except Exception:
        pass
    return 'cpu'


def has(mod):
    try:
        __import__(mod)
        return True
    except Exception:
        return False


def parts():
    return {'separar': has('audio_separator'), 'letra': has('faster_whisper'), 'notas': has('muscriptor'),
            'sam': has('sam_audio') and (shutil.which('sam-audio-infer') is not None or has('sam_audio_infer'))}


class Job:
    def __init__(self, task, inp, out_dir, params):
        self.id = uuid.uuid4().hex[:10]
        self.task, self.inp, self.out, self.params = task, inp, out_dir, params or {}
        self.status, self.stage, self.progress, self.result, self.error = 'queued', 'En cola', 0.0, None, ''

    def set(self, stage=None, progress=None):
        if stage is not None:
            self.stage = stage
        if progress is not None:
            self.progress = max(0.0, min(1.0, float(progress)))
        print('[%s] %s %.0f%%' % (self.id, self.stage, self.progress * 100), flush=True)

    def view(self):
        d = {'status': self.status, 'stage': self.stage, 'progress': self.progress, 'device': device()}
        if self.status == 'done':
            d['result'] = self.result
        if self.status == 'error':
            d['error'] = self.error
        return d


# ---------------------------------------------------------------- separación (audio-separator)
SEP_MODELS = {
    # nombre corto -> archivo que audio-separator descarga solo
    'bs_roformer_vocals': 'model_bs_roformer_ep_317_sdr_12.9755.ckpt',      # BS-RoFormer ViperX: voz / instrumental
    'mel_roformer_vocals': 'model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt',
    'htdemucs_ft': 'htdemucs_ft.yaml',                                      # batería, bajo, otros, voz
    'htdemucs_6s': 'htdemucs_6s.yaml',                                      # + guitarra y piano
}


def separator(model_key, out_dir):
    from audio_separator.separator import Separator
    sep = Separator(output_dir=out_dir, model_file_dir=os.path.join(MODELS, 'audio-separator'), output_format='WAV',
                    output_single_stem=None, log_level=30)
    sep.load_model(model_filename=SEP_MODELS.get(model_key, model_key))
    return sep


def stem_name(path):
    n = os.path.basename(path).lower()
    for k, v in [('vocals', 'voz'), ('instrumental', 'instrumental'), ('drums', 'bateria'), ('bass', 'bajo'),
                 ('guitar', 'guitarra'), ('piano', 'piano'), ('other', 'otros')]:
        if '(' + k + ')' in n or '_' + k in n:
            return v
    return os.path.splitext(os.path.basename(path))[0]


def task_separate(job):
    """params.stems: lista de stems pedidos (voz, bateria, bajo, guitarra, piano, otros, instrumental).
    Usa el mejor modelo para cada uno: voz con BS-RoFormer; el resto con htdemucs_ft o htdemucs_6s."""
    want = job.params.get('stems') or ['voz', 'bateria', 'bajo', 'otros']
    files = []
    plan = []
    if 'voz' in want or 'instrumental' in want:
        plan.append(job.params.get('vocal_model') or 'bs_roformer_vocals')
    rest = [s for s in want if s not in ('voz', 'instrumental')]
    if rest:
        plan.append('htdemucs_6s' if any(s in ('guitarra', 'piano') for s in rest) else 'htdemucs_ft')
    for i, m in enumerate(plan):
        job.set('Separando con %s (%s)' % (m, device()), 0.05 + 0.9 * i / len(plan))
        sub = os.path.join(job.out, m)
        os.makedirs(sub, exist_ok=True)
        with GPU_LOCK:
            out = separator(m, sub).separate(job.inp)
        for f in out:
            p = f if os.path.isabs(f) else os.path.join(sub, f)
            st = stem_name(p)
            if m.startswith('htdemucs') and st == 'voz' and 'voz' in want and plan[0] != m:
                continue     # la voz ya sale mejor de RoFormer
            if st in want or (st == 'otros' and 'otros' in want):
                files.append({'name': st + '.wav', 'stem': st, 'path': p})
    job.set('Hecho', 1)
    return {'files': files, 'data': {'models': plan}}


# ---------------------------------------------------------------- SAM Audio (sonido descrito con texto)
def task_sam(job):
    desc = (job.params.get('description') or '').strip()
    if not desc:
        raise ValueError('Falta la descripción del sonido')
    size = job.params.get('size') or ('base' if device() != 'cpu' else 'small')
    tgt, res = os.path.join(job.out, 'objetivo.wav'), os.path.join(job.out, 'resto.wav')
    job.set('SAM Audio (%s) separando «%s»' % (size, desc), 0.1)
    exe = shutil.which('sam-audio-infer') or os.path.join(os.path.dirname(sys.executable), 'sam-audio-infer')
    cmd = [exe, 'separate', job.inp, '-d', desc, '-o', tgt, '--residual', res, '--model', size, '--device', device(),
           '--cache-dir', os.path.join(MODELS, 'sam-audio')]
    if os.environ.get('HF_TOKEN'):
        cmd += ['--hf-token', os.environ['HF_TOKEN']]
    with GPU_LOCK:
        p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError('SAM Audio: ' + (p.stderr or p.stdout)[-800:])
    job.set('Hecho', 1)
    return {'files': [{'name': 'objetivo.wav', 'stem': 'objetivo', 'path': tgt}, {'name': 'resto.wav', 'stem': 'resto', 'path': res}],
            'data': {'description': desc, 'size': size}}


# ---------------------------------------------------------------- letra (Whisper)
def whisper_model(size):
    key = 'whisper:' + size
    if key not in _cache:
        from faster_whisper import WhisperModel
        dev = 'cuda' if device() == 'cuda' else 'cpu'          # ctranslate2 no usa Metal: en Mac va por CPU
        _cache[key] = WhisperModel(size, device=dev, compute_type='float16' if dev == 'cuda' else 'int8',
                                   download_root=os.path.join(MODELS, 'whisper'))
    return _cache[key]


def task_lyrics(job):
    size = job.params.get('size') or ('large-v3' if device() == 'cuda' else 'medium')
    job.set('Cargando Whisper %s' % size, 0.05)
    with GPU_LOCK:
        m = whisper_model(size)
        job.set('Transcribiendo la voz', 0.15)
        segs, info = m.transcribe(job.inp, word_timestamps=True, language=job.params.get('language') or None,
                                  vad_filter=False, condition_on_previous_text=False,
                                  initial_prompt=job.params.get('lyrics') or None)
        words, dur = [], info.duration or 1
        for s in segs:
            for w in (s.words or []):
                words.append({'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3), 'p': round(w.probability, 3)})
            job.set(None, 0.15 + 0.8 * min(1, s.end / dur))
    job.set('Hecho', 1)
    return {'files': [], 'data': {'words': words, 'language': info.language, 'model': size}}


# ---------------------------------------------------------------- notas (MuScriptor)
def task_notes(job):
    """MuScriptor: notas de todos los instrumentos (o solo de los pedidos en params.instruments)."""
    size = job.params.get('size') or ('large' if device() == 'cuda' else 'medium' if device() == 'mps' else 'small')
    job.set('Cargando MuScriptor %s' % size, 0.05)
    from muscriptor import TranscriptionModel
    from muscriptor.events import NoteStartEvent, NoteEndEvent, ProgressEvent
    key = 'mus:' + size
    with GPU_LOCK:
        if key not in _cache:
            _cache[key] = TranscriptionModel.load_model(size)
        m = _cache[key]
        job.set('Transcribiendo notas', 0.1)
        events, notes = [], []
        for e in m.transcribe(job.inp, instruments=job.params.get('instruments') or None):
            events.append(e)
            if isinstance(e, ProgressEvent) and e.total:
                job.set(None, 0.1 + 0.85 * e.completed / e.total)
            elif isinstance(e, NoteEndEvent):
                st = e.start_event
                inst = str(st.instrument)
                notes.append({'t': round(float(st.start_time), 4), 'd': round(max(0.01, float(e.end_time) - float(st.start_time)), 4),
                              'p': int(st.pitch), 'v': 100, 'inst': inst, 'drum': 'drum' in inst.lower()})
        midi = m.events_to_midi_bytes(iter(events))
    with open(os.path.join(job.out, 'notas.mid'), 'wb') as f:
        f.write(midi)
    notes.sort(key=lambda n: n['t'])
    job.set('Hecho', 1)
    return {'files': [], 'data': {'notes': notes, 'midi_b64': __import__('base64').b64encode(midi).decode(), 'model': size}}


def midi_notes(path):
    import mido
    mf = mido.MidiFile(path)
    out, t, on, prog = [], 0.0, {}, {}
    for msg in mf:                      # iterar el archivo da tiempos en segundos
        t += msg.time
        if msg.type == 'program_change':
            prog[msg.channel] = msg.program
        if msg.type == 'note_on' and msg.velocity > 0:
            on[(msg.channel, msg.note)] = (t, msg.velocity)
        elif msg.type in ('note_off', 'note_on'):
            k = (msg.channel, msg.note)
            if k in on:
                s, v = on.pop(k)
                out.append({'t': round(s, 4), 'd': round(max(0.01, t - s), 4), 'p': msg.note, 'v': v,
                            'ch': msg.channel, 'prog': prog.get(msg.channel, 0), 'drum': msg.channel == 9})
    return sorted(out, key=lambda n: n['t'])


TASKS = {'separate': task_separate, 'sam': task_sam, 'lyrics': task_lyrics, 'notes': task_notes}


def worker(job):
    job.status = 'running'
    try:
        job.result = TASKS[job.task](job)
        job.status = 'done'
    except Exception as e:
        traceback.print_exc()
        job.error = '%s: %s' % (type(e).__name__, e)
        job.status = 'error'


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, obj):
        b = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == '/status':
            return self.send(200, {'device': device(), 'parts': parts(), 'python': sys.version.split()[0]})
        if self.path.startswith('/job/'):
            j = JOBS.get(self.path[5:])
            return self.send(200, j.view()) if j else self.send(404, {'error': 'Trabajo desconocido'})
        self.send(404, {'error': 'Ruta desconocida'})

    def do_POST(self):
        if self.path != '/run':
            return self.send(404, {'error': 'Ruta desconocida'})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}')
            if body.get('task') not in TASKS:
                return self.send(400, {'error': 'Tarea desconocida: %s' % body.get('task')})
            if not body.get('input') or not os.path.exists(body['input']):
                return self.send(400, {'error': 'No se encuentra el audio de entrada'})
            os.makedirs(body['out_dir'], exist_ok=True)
            j = Job(body['task'], body['input'], body['out_dir'], body.get('params'))
            with LOCK:
                JOBS[j.id] = j
            threading.Thread(target=worker, args=(j,), daemon=True).start()
            self.send(200, {'id': j.id})
        except Exception as e:
            self.send(500, {'error': str(e)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=0)
    a = ap.parse_args()
    os.makedirs(MODELS, exist_ok=True)
    srv = ThreadingHTTPServer(('127.0.0.1', a.port), H)
    print('SH_ENGINE_PORT %d' % srv.server_address[1], flush=True)
    print('Motor listo · dispositivo %s · partes %s' % (device(), parts()), flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    main()
