import 'dotenv/config.js';
import { DjsConnect } from '@unitn-asa/deliveroo-js-sdk';
import { BDIAgent } from './src-restructured/agent.js';

// Connect
const socket = DjsConnect();

socket.onConnect(() => {
  console.log('Connected to server');
});

socket.onDisconnect(() => {
  console.warn('Disconnected');
});

// BDIAgent now constructs BeliefBase internally
const agent = new BDIAgent(socket);

// Start the agent
agent.start();

console.log('[NPCurious] Agent started — waiting for world data...');
