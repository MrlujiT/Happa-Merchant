export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // /happa and /happa/* → serve happa.html
    if (url.pathname === '/happa' || url.pathname.startsWith('/happa/') || url.pathname.startsWith('/happa?')) {
      const r = new Request(new URL('/happa.html', request.url), request);
      return env.ASSETS.fetch(r);
    }
    return env.ASSETS.fetch(request);
  }
}
