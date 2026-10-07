import {
  sendMetaPurchase,
  hashEmail,
  hashExternalId,
} from "../services/metaConversionsApi.js";

const run = async () => {
  const result = await sendMetaPurchase({
    eventId: `test-${Date.now()}`,

    eventSourceUrl: "https://remoteagricng.com",

    userData: {
      em: [hashEmail("test@example.com")],
      external_id: [hashExternalId("meta-capi-test-user")],
    },

    customData: {
      value: 1000,
      currency: "NGN",
      content_name: "CAPI Test Investment",
      content_type: "product",
      content_ids: ["capi-test"],
      num_items: 1,
    },

    ...(process.env.META_TEST_EVENT_CODE
      ? { testEventCode: process.env.META_TEST_EVENT_CODE }
      : {}),
  });

  console.log("Meta CAPI test response:", result);
};

run().catch((error) => {
  console.error("Meta CAPI test failed:", error);
  process.exit(1);
});
