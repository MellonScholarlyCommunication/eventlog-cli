#!/usr/bin/env node

const { program } = require('commander');
const { createHash } = require('crypto');
const { discoverLog, 
        getLog, 
        getEventSubject, 
        getEvent,
        canonizeEvent 
    } = require('../lib/eventlog.js');

program
  .name('memento-cli')
  .version('1.0.1')
  .description('CLI to Event Logs');

program.command('where')
  .option('-f, --for <url>','Artifact url')
  .argument('<url>', 'Artifact|Service url')
  .action( async (url,options) => {
    const loc = await discoverLog(url,options['for']);
    if (loc) {
        console.log(loc);
    }
  });

program.command('get') 
  .argument('<url>', 'EventLog url')
  .action( async (url) => {
    const log = await getLog(url);
    if (log) {
        console.log(JSON.stringify(log,null,2));
    }
  });

program.command('event') 
  .argument('<url>', 'Event url')
  .action( async (url) => {
    const subject = await getEventSubject(url);
    const event = await getEvent(url,subject);
    const canonical = await canonizeEvent(url);
    event['sha256'] = sha256(canonical);

    console.log(JSON.stringify(event,null,2));
  });

program.parse();

function sha256(data) {
    return createHash('sha256').update(data).digest('base64');
}