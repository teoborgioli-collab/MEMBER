import { randomBytes, scryptSync } from 'node:crypto';
// Read the password from stdin; never put it in a command-line argument or source file.
let password = '';
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, '');
if (password.length < 16 || password.length > 256)
  throw new Error('Use a password between 16 and 256 characters.');
const salt = randomBytes(16).toString('hex');
console.log(salt + ':' + scryptSync(password, salt, 64).toString('hex'));
