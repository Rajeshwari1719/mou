export const DATA_CHANGED_EVENT = 'mou-manager:data-changed';

export const notifyDataChanged = (resource = 'all') => {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { resource } }));
};
