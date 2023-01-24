const { parentPort } = require('worker_threads')
 
parentPort.on('message', (value) => {
   parentPort.postMessage('pong');
   parentPort.close(); 
})