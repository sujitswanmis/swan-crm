export function tableViewKey(id, mobile) {
  return `crm_table_view_${mobile ? 'mobile' : 'desktop'}_${id}`;
}

export function readTableView(id, mobile, storage, desktopKey) {
  try {
    const value = storage?.getItem(!mobile && desktopKey ? desktopKey : tableViewKey(id, mobile));
    if (value === 'table' || value === 'tiles') return value;
  } catch (_error) {}
  return mobile ? 'tiles' : 'table';
}

export function writeTableView(id, mobile, value, storage, desktopKey) {
  if (value !== 'table' && value !== 'tiles') return false;
  try {
    storage?.setItem(!mobile && desktopKey ? desktopKey : tableViewKey(id, mobile), value);
    return Boolean(storage);
  } catch (_error) { return false; }
}
