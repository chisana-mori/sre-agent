import http from 'http';

const options = {
  hostname: 'localhost',
  port: 8081,
  path: '/api/stream/investigate',
  method: 'POST',
  headers: {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  },
};

console.log('Connecting to SSE endpoint...');

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);

  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
    if (chunk.includes('connection_ack')) {
      console.log('Connection acknowledged. Sending payload...');
      // Extract connectionId
      const match = chunk.match(/"connectionId":"([^"]+)"/);
      if (match) {
        const connectionId = match[1];
        sendPayload(connectionId);
      }
    }
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

// Send initial body
req.write(JSON.stringify({}));
req.end();

function sendPayload(connectionId: string) {
  const payloadData = JSON.stringify({
    connectionId: connectionId,
    payload: {
      text: 'Hello, are you working?',
    },
  });

  const sendOptions = {
    hostname: 'localhost',
    port: 8081,
    path: '/api/stream/investigate/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payloadData),
    },
  };

  const sendReq = http.request(sendOptions, (res) => {
    console.log(`SEND STATUS: ${res.statusCode}`);
    res.on('data', (chunk) => {
      console.log(`SEND BODY: ${chunk}`);
    });
  });

  sendReq.on('error', (e) => {
    console.error(`problem with send request: ${e.message}`);
  });

  sendReq.write(payloadData);
  sendReq.end();
}
