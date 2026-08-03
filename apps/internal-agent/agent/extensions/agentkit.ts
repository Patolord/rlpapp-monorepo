import agentkit from "@upstash/agentkit-eve-extension";

// Serverless Upstash Redis (REST). Reads UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN via Redis.fromEnv().
// Adds agentkit__recall_memory / agentkit__save_memory, plus past-conversation
// tools when chatHistory is enabled.
export default agentkit({
  chatHistory: true,
});
