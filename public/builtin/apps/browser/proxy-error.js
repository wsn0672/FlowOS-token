export function isProxyError (document) {
  const title = document?.querySelector('#errorTitle')?.textContent.trim();
  return title === 'Error processing your request' || (title === 'Uh oh!' && !!document.querySelector('#errorTrace'));
}
