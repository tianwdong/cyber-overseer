import importlib.util, json, os, pathlib, subprocess, sys, tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('launcher', sys.argv[1])
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)
original_cwd = os.getcwd()
with tempfile.TemporaryDirectory() as directory:
    root = pathlib.Path(directory)
    config = root / 'launch.json'
    config.write_text(json.dumps({'cwd': directory, 'codexHome': directory, 'binary': 'codex'}))
    calls = []
    class Child:
        def __init__(self, server):
            self.server = server
            self.pid = 100
            self.returncode = None if server else 0
            self.killed = False
        def poll(self): return self.returncode
        def wait(self, timeout=None):
            if self.server and not self.killed: raise subprocess.TimeoutExpired('test', timeout)
            self.returncode = 0
            return 0
        def terminate(self): calls.append('terminate')
        def kill(self): self.killed = True; calls.append('kill')
    def spawn(args, **kwargs):
        assert kwargs['env']['CODEX_HOME'] == directory
        assert not any('continue' == arg for arg in args)
        if 'app-server' in args:
            assert kwargs['stdin'] == subprocess.DEVNULL
            assert '--ws-token-file' in args
            assert ('start_new_session' in kwargs or 'creationflags' in kwargs)
            assert len((root / 'token').read_text()) >= 32
            calls.append('server')
            return Child(True)
        assert '--remote' in args and '--remote-auth-token-env' in args
        assert kwargs['env']['CYBER_OVERSEER_CLI_TOKEN'] == (root / 'token').read_text()
        assert (root / 'endpoint.json').exists()
        calls.append('terminal')
        return Child(False)
    class Ready:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def open(self, *args, **kwargs): return self
    try:
        with patch.object(launcher.subprocess, 'Popen', spawn), patch.object(launcher.urllib.request, 'build_opener', return_value=Ready()):
            assert launcher.main(str(config)) == 0
        assert calls == ['server', 'terminal', 'terminate', 'kill'], calls
        assert not (root / 'endpoint.json').exists()
        assert not (root / 'token').exists()
    finally:
        os.chdir(original_cwd)
print('launcher lifecycle passed')
