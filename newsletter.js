import { DittofeedSdk } from "https://cdn.jsdelivr.net/npm/@dittofeed/sdk-web@0.3.1/+esm";

const sdkReady = DittofeedSdk.init({
  writeKey: "Basic MDk5YzE5NmYtY2VkMS00MTQ0LWExODItM2E0YjUzZjNmOGM2OmZkM2MyNDIwNGI0MGFjM2M=",
  host: "https://dittofeed.kindmeadow-6d7cb681.norwayeast.azurecontainerapps.io",
});

const form = document.getElementById("newsletter-form");
const status = document.getElementById("newsletter-status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = form.email.value.trim().toLowerCase();
  const button = form.querySelector("button");

  button.disabled = true;
  status.textContent = "";

  try {
    await sdkReady;
    DittofeedSdk.identify({
      userId: email,
      traits: { email, newsletter: true, source: "galton.no" },
    });
    DittofeedSdk.track({
      userId: email,
      event: "Newsletter Signup",
      properties: { source: "galton.no" },
    });
    await DittofeedSdk.flush();
    form.reset();
    status.textContent = "Takk! Du er nå påmeldt.";
  } catch (error) {
    console.error(error);
    status.textContent = "Noe gikk galt. Prøv igjen senere.";
  } finally {
    button.disabled = false;
  }
});
