const version = new URL(import.meta.url).searchParams.get('v');
const appURL = new URL(
  document.querySelector('[data-app-entry]').dataset.appEntry,
  document.baseURI,
);
appURL.searchParams.set('v', version);

let started = false;

async function start() {
  if ('serviceWorker' in navigator) {
    const workers = navigator.serviceWorker;
    const workerURL = new URL('../service-worker.js', import.meta.url);
    workerURL.searchParams.set('v', version);
    const previousController = workers.controller;
    const registration = workers.register(workerURL, { updateViaCache: 'none' });

    if (previousController && previousController.scriptURL !== workerURL.href) {
      // Uma página nova ainda pode estar sob controle do cache da versão anterior.
      await new Promise((resolve) => {
        const finish = () => {
          clearTimeout(timeout);
          workers.removeEventListener('controllerchange', controllerChanged);
          resolve();
        };
        const controllerChanged = () => {
          if (workers.controller?.scriptURL === workerURL.href) {
            finish();
          }
        };
        const timeout = setTimeout(finish, 8000);
        workers.addEventListener('controllerchange', controllerChanged);
        registration.catch(finish);
        controllerChanged();
      });
    }

    registration.catch((error) => console.warn('Modo offline indisponível:', error));
    workers.addEventListener(
      'controllerchange',
      () => {
        if (
          workers.controller?.scriptURL === workerURL.href &&
          document.getElementById('bootError')
        ) {
          location.reload();
        } else if (previousController && started) {
          const bar = document.createElement('div');
          bar.id = 'updateBanner';
          bar.className = 'update-banner';
          bar.setAttribute('role', 'status');
          bar.innerHTML =
            '<span>Nova versão disponível.</span><button type="button" class="primary">Atualizar</button>';
          bar.querySelector('button').addEventListener('click', () => location.reload());
          document.body.appendChild(bar);
        }
      },
      { once: true },
    );
  }

  await import(appURL.href);
  started = true;
}

start().catch((error) => {
  console.error('Falha ao abrir o aplicativo:', error);
  document.getElementById('app').innerHTML =
    '<div id="bootError" class="panel" role="alert"><p>Não foi possível abrir esta versão. Tente recarregar a página com internet.</p><button type="button">Recarregar</button></div>';
  document.querySelector('#bootError button').addEventListener('click', () => location.reload());
});
