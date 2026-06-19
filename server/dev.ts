import { spawn } from "node:child_process";

const processes = [
  spawn("npm", ["run", "dev:server"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev:web"], { stdio: "inherit" })
];

const stop = () => processes.forEach((process) => process.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
