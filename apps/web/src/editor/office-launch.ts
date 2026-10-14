export const OFFICE_UI_DEFAULTS =
  'UIMode=compact;ShowSidebar=false;TextSidebar=false;ShowMenubar=true;ShowToolbar=true;ShowStatusbar=true;ShowRuler=true;TextMenubar=true;TextStatusbar=true;TextRuler=true;UITheme=light;SavedUIState=false;SaveAsMode=group';

export function buildOfficeLaunchUrl(actionUrl: string, wopiSource: string): string {
  const url = new URL(actionUrl);
  // WOPISrc is a launch-URL query parameter. Only access_token and its expiry are
  // form-posted; Collabora rejects WOPISrc supplied as a form field.
  url.searchParams.set('WOPISrc', wopiSource);
  url.searchParams.set('ui_defaults', OFFICE_UI_DEFAULTS);
  return url.toString();
}
