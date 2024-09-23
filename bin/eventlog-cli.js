#!/usr/bin/env node

const { program } = require('commander');
const { discoverLog, 
        listEvents, 
        listEventMementos,
        crawlEvent,
        printN3Store,
        eventDetails
    } = require('../lib/eventlog.js');

program
  .name('memento-cli')
  .version('1.0.1')
  .description('CLI to Event Logs');

program.command('where')
  .option('-f, --for <service url>','Service Node Url')
  .argument('<url>', 'Artifact')
  .action( async (url,options) => {
    let loc;

    if (options['for']) {
      loc = await discoverLog(options['for'],url);
    }
    else {
      loc = await discoverLog(url);
    }
    
    if (loc) {
        console.log(loc);
    }
  });

program.command('list') 
  .argument('<url>', 'EventLog url')
  .action( async (url) => {
    const log = await listEvents(url);
    if (log) {
        console.log(JSON.stringify(log,null,2));
    }
  });

program.command('list-all')
  .argument('<url>', 'EventLog url')
  .action( async (url) => {
    const log = await listEvents(url);
    const result = [];
    if (log) {
      for (let i = 0 ; i < log.length ; i++) {
        const event = await eventDetails(log[i]);
        result.push(event);   
      }

      console.log(JSON.stringify(result,null,2));
    }
  });

program.command('get') 
  .argument('<url>', 'Event url')
  .action( async (url) => {
    const event = await eventDetails(url);
    console.log(JSON.stringify(event,null,2));
  });

program.command('list-mementos')
  .argument('<url>', 'Event url')
  .action( async (url) => {
    const mementos = await listEventMementos(url);
    console.log(JSON.stringify(mementos,null,2));
  });

program.command('crawl')
  .option('-f, --for <service url>','Service Node Url')
  .argument('<artifact>', 'Artifact')
  .action( async (artifact,options) => {
    let store;

    if (options['for']) {
      store = await crawlEvent(options['for'],artifact);
    }
    else {
      store = await crawlEvent(artifact);
    }

    const trig = await printN3Store(store, 'TriG');

    if (trig) {
      console.log(trig.replaceAll(/{/g,'= {').replaceAll(/}/g,'}.'));
    }
    else {
      process.exit(2);
    }
  });

program.parse();
