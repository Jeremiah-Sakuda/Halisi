import { MemoryClaimStore } from "@/lib/store/MemoryClaimStore";
import { invariantSuite } from "./invariantSuite";

// The in-process engine, held to the spec. The same suite is applied to the DynamoDB store in
// dynamo.test.ts, so both backends are proven behaviorally identical on the invariant.
invariantSuite("MemoryClaimStore", () => new MemoryClaimStore());
