const { parentPort } = require('worker_threads')
 
parentPort.on('message', (msg) => {
   if(msg.startsWith("END"))
      parentPort.close(); 
   else parentPort.postMessage(msg);
})