(() => {
  let pendingPrompt;
  let installed = false;
  let updateButton = () => {};

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    pendingPrompt = undefined;
    updateButton();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('installApp');
    const dialog = document.getElementById('installHelp');
    const steps = document.getElementById('installSteps');
    const status = document.getElementById('installStatus');
    const standalone = window.matchMedia('(display-mode: standalone)');
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const platform = ios ? 'ios' : /Android/i.test(ua) ? 'android' :
      /Macintosh/i.test(ua) ? 'mac' : 'desktop';

    const isInstalled = () => installed || standalone.matches || navigator.standalone === true;
    updateButton = () => {
      button.textContent = isInstalled() ? 'App instalado' : 'Instalar app';
    };
    updateButton();
    standalone.addEventListener?.('change', updateButton);

    function showHelp(message, alreadyInstalled = false) {
      document.getElementById('installTitle').textContent = alreadyInstalled ? 'App instalado' : 'Instalar app';
      status.textContent = message;
      status.hidden = !message;
      steps.hidden = alreadyInstalled;
      steps.querySelectorAll('[data-install-platform]').forEach(item => {
        item.hidden = item.getAttribute('data-install-platform') !== platform;
      });
      document.getElementById('installBrowserTip').hidden = alreadyInstalled;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else {
        dialog.setAttribute('open', '');
        dialog.querySelector('button').focus();
      }
    }

    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      button.focus();
    });

    button.addEventListener('click', async () => {
      if (isInstalled()) {
        const guidance = {
          android: 'Para desinstalar, toque e segure o ícone do app e procure Desinstalar. Também pode usar as configurações de apps do Android.',
          ios: 'Para remover, toque e segure o ícone do app na Tela de Início.',
          mac: 'Para remover, use a opção de desinstalação do navegador ou remova o app pelo sistema.',
          desktop: 'Para desinstalar, procure a opção no menu da janela do app ou nas configurações de apps do navegador.'
        };
        showHelp(guidance[platform], true);
        return;
      }
      if (!pendingPrompt) {
        showHelp('');
        return;
      }

      const prompt = pendingPrompt;
      pendingPrompt = undefined;
      button.disabled = true;
      try {
        const result = await prompt.prompt();
        const choice = result || await prompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          installed = true;
          updateButton();
        }
      } catch {
        showHelp('Use o menu do navegador para instalar.');
      } finally {
        button.disabled = false;
      }
    });
  }, {once: true});
})();
