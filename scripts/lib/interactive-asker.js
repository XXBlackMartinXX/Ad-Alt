'use strict';
/**
 * Builds an `ask(prompt)` function that works correctly whether stdin is
 * a real interactive terminal or a piped/redirected stream (as used by
 * this repo's own automated wizard tests).
 *
 * On a real TTY, `readline.question()` is used normally -- it prints
 * the prompt and waits for the next line the human types.
 *
 * On a non-TTY stream, Node's readline emits every buffered 'line'
 * event as fast as the event loop allows, independent of whether a
 * `question()` call is currently pending -- sequential `await
 * question()` calls each register a one-shot listener too late to
 * catch most of the buffered lines, silently dropping answers. To
 * avoid that race, non-TTY mode instead reads all of stdin up front,
 * splits it into lines, and hands them out one at a time in order,
 * printing the prompt text itself (mirroring what a human would see).
 *
 * Shared by scripts/setup-controlled-pilot.js and
 * scripts/closeout-controlled-pilot.js.
 */

const fs = require('fs');
const readline = require('readline');

function makeAsker() {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return {
      ask: (q) => new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim()))),
      close: () => rl.close(),
    };
  }

  const rawInput = fs.readFileSync(0, 'utf8');
  const queue = rawInput.split('\n').map((l) => l.trim());
  return {
    ask: async (q) => {
      process.stdout.write(q);
      const next = queue.shift();
      if (next === undefined) {
        throw new Error('Wizard ran out of piped answers before all questions were asked.');
      }
      process.stdout.write(`${next}\n`);
      return next;
    },
    close: () => {},
  };
}

module.exports = { makeAsker };
