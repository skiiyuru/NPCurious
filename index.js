import 'dotenv/config.js';
import { DjsConnect } from '@unitn-asa/deliveroo-js-sdk';
import { BeliefBase } from './src/beliefs.js';
import { BDIAgent } from './src/agent.js';

// Connect 
const socket = DjsConnect();

socket.onConnect(() => {
  console.log('Connected to server');
});

socket.onDisconnect(() => {
  console.warn('Disconnected');
});

// Initialise BDI components 
const beliefs = new BeliefBase();
const agent = new BDIAgent(socket, beliefs);

// Start the agent 
agent.start();

console.log('[NPCurious] Agent started — waiting for world data...');
