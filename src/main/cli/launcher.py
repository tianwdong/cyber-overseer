"""Terminal-owned Codex server. No prompts are submitted by this launcher."""
import json, os, pathlib, secrets, signal, socket, subprocess, sys, time, urllib.request


def main(config_path):
    config = json.loads(pathlib.Path(config_path).read_text(encoding='utf-8'))
    root = pathlib.Path(config_path).parent
    os.chdir(config['cwd'])
    env = dict(os.environ, CODEX_HOME=config['codexHome'])
    token = secrets.token_urlsafe(32)
    token_file = root / 'token'
    fd = os.open(str(token_file), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(token)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    url = 'ws://127.0.0.1:' + str(port)
    options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
    server = None
    terminal = None
    try:
        with (root / 'server.log').open('w') as log:
            server = subprocess.Popen([config['binary'], 'app-server', '--listen', url,
                '--ws-auth', 'capability-token', '--ws-token-file', str(token_file)],
                env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, **options)
            for _ in range(100):
                if server.poll() is not None:
                    raise RuntimeError('Codex server failed. See ' + str(root / 'server.log'))
                try:
                    req = urllib.request.Request('http://127.0.0.1:' + str(port) + '/readyz', headers={'Authorization': 'Bearer ' + token})
                    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=0.5):
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise RuntimeError('Codex server startup timed out')
            temp = root / 'endpoint.tmp'
            temp.write_text(json.dumps({'url': url, 'pid': server.pid}), encoding='utf-8')
            temp.replace(root / 'endpoint.json')
            env['CYBER_OVERSEER_CLI_TOKEN'] = token
            terminal = subprocess.Popen([config['binary'], '--remote', url,
                '--remote-auth-token-env', 'CYBER_OVERSEER_CLI_TOKEN'], env=env)
            while terminal.poll() is None:
                try:
                    terminal.wait()
                except KeyboardInterrupt:
                    pass  # The native terminal handles Ctrl+C itself.
            return terminal.returncode
    finally:
        if terminal is not None and terminal.poll() is None:
            terminal.terminate()
        (root / 'endpoint.json').unlink(missing_ok=True)
        if server is not None and server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
        token_file.unlink(missing_ok=True)


if __name__ == '__main__':
    def stop(signum, frame):
        raise SystemExit(128 + signum)
    signal.signal(signal.SIGTERM, stop)
    if hasattr(signal, 'SIGHUP'):
        signal.signal(signal.SIGHUP, stop)
    try:
        sys.exit(main(sys.argv[1]))
    except Exception as error:
        print('Cyber Overseer: ' + str(error), file=sys.stderr)
        input('Press Enter to close...')
        sys.exit(1)
