const endpoint = process.argv[2] || "students";

const apiUrl = process.env.API_URL || "https://rqp-backend.onrender.com/api";
const token = process.env.AUTH_TOKEN || "";
const connections = Number(process.env.CONNECTIONS || 10);
const durationSeconds = Number(process.env.DURATION_SECONDS || 20);

if (!token) {
  console.error("Missing AUTH_TOKEN. Set it first, then run this script.");
  process.exit(1);
}

const endpoints = {
  years: "/classes/academic-years",
  students: "/students",
};

if (!endpoints[endpoint]) {
  console.error(`Unknown endpoint "${endpoint}". Use "students" or "years".`);
  process.exit(1);
}

const url = new URL(`${apiUrl.replace(/\/$/, "")}${endpoints[endpoint]}`);

if (endpoint === "students") {
  url.searchParams.set("light", "true");
  url.searchParams.set("status", "active");
  url.searchParams.set("limit", "15");
  url.searchParams.set("count", "false");
  url.searchParams.set("sort", "name");
}

const endAt = Date.now() + durationSeconds * 1000;
const records = [];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function hit() {
  const started = performance.now();
  let status = 0;
  let bytes = 0;

  try {
    const response = await fetch(url, {
      headers: {
        Cookie: `auth_token=${token}`,
      },
    });
    status = response.status;
    const body = await response.arrayBuffer();
    bytes = body.byteLength;
  } catch {
    status = -1;
  }

  records.push({
    status,
    bytes,
    ms: performance.now() - started,
  });
}

async function worker() {
  while (Date.now() < endAt) {
    await hit();
  }
}

console.log(`Running ${durationSeconds}s test @ ${url.toString()}`);
console.log(`${connections} connections`);

await Promise.all(Array.from({ length: connections }, () => worker()));

const latencies = records.map((record) => record.ms);
const ok = records.filter((record) => record.status >= 200 && record.status < 300).length;
const statusCounts = records.reduce((acc, record) => {
  acc[record.status] = (acc[record.status] || 0) + 1;
  return acc;
}, {});
const totalBytes = records.reduce((sum, record) => sum + record.bytes, 0);

console.log("");
console.log(`Requests: ${records.length}`);
console.log(`2xx: ${ok}`);
console.log(`Non-2xx/errors: ${records.length - ok}`);
console.log(`Req/sec: ${(records.length / durationSeconds).toFixed(2)}`);
console.log(`Bytes read: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`Avg latency: ${(latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(1)} ms`);
console.log(`p50 latency: ${percentile(latencies, 50).toFixed(1)} ms`);
console.log(`p95 latency: ${percentile(latencies, 95).toFixed(1)} ms`);
console.log(`p99 latency: ${percentile(latencies, 99).toFixed(1)} ms`);
console.log(`Max latency: ${Math.max(...latencies).toFixed(1)} ms`);
console.log(`Status counts: ${JSON.stringify(statusCounts)}`);
