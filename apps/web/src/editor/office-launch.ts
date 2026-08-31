export function buildOfficeLaunchUrl(actionUrl: string, wopiSource: string): string {
  const url = new URL(actionUrl);
  // WOPISrc is a launch-URL query parameter. Only access_token and its expiry are
  // form-posted; Collabora rejects WOPISrc supplied as a form field.
  url.searchParams.set('WOPISrc', wopiSource);
  return url.toString();
}
