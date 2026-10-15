import './ui/app';
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('pwa-update', { detail: () => updateSW(true) }));
  },
});

if (navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => false);
}
