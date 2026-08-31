export function buildOfficeLaunchUrl(actionUrl: string, wopiSource: string): string {
  const url = new URL(actionUrl);
  // WOPISrc is a launch-URL query parameter. Only access_token and its expiry are
  // form-posted; Collabora rejects WOPISrc supplied as a form field.
  url.searchParams.set('WOPISrc', wopiSource);
  url.searchParams.set('ui_defaults', 'UIMode=compact;ShowSidebar=false;TextSidebar=false;Sidebar=false;ShowProperties=false;ShowMenubar=false;ShowToolbar=false;ShowStatusbar=false;ShowRuler=false;TextMenubar=false;TextStatusbar=false;TextRuler=false;SaveAsMode=group');
  return url.toString();
}
