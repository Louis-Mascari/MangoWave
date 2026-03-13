function handler(event) {
  const request = event.request;
  const host = request.headers.host.value;

  if (host === 'mangowave.app' || host === 'www.mangowave.app') {
    const uri = request.uri;
    if (uri === '/' || uri === '') {
      request.uri = '/landing/index.html';
    } else if (!uri.startsWith('/landing/')) {
      request.uri = '/landing' + uri;
    }
  }

  return request;
}

