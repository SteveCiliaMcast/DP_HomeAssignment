const services = [
  "https://cab-api-gateway-63vc.onrender.com/health",
  "https://cab-customer-service.onrender.com/health",
  "https://cab-booking-service-3x3x.onrender.com/health",
  "https://cab-payment-service-1zxu.onrender.com/health",
  "https://cab-fare-service-d8rj.onrender.com/health",
  "https://cab-location-service-favf.onrender.com/health"
];

const maxAttempts = Number(process.env.WAKE_ATTEMPTS || 5);
const retryDelayMs = Number(process.env.WAKE_RETRY_DELAY_MS || 15000);
const requestTimeoutMs = Number(process.env.WAKE_REQUEST_TIMEOUT_MS || 25000);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ping(url, attempt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    const body = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 160)}`);
    }

    console.log(`OK ${url} attempt ${attempt}`);
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

async function wakeService(url) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await ping(url, attempt);
    } catch (error) {
      console.log(`WAIT ${url} attempt ${attempt} failed: ${error.message}`);

      if (attempt < maxAttempts) {
        await wait(retryDelayMs);
      }
    }
  }

  console.error(`FAILED ${url}`);
  return false;
}

async function main() {
  const results = await Promise.all(services.map(wakeService));
  const failed = results.filter((result) => !result).length;

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();
