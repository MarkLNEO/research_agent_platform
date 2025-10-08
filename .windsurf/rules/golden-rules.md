---
trigger: always_on
---

This project uses Open AI's gpt-5/gpt-5-mini and the Responses API ONLY. 

Do **not** revert to 4o or another model. Do **not** revert to the Completions API. 

If you are uncertain about something related to the model or API, use DeepWiki or another resources to access the GPT-5 and/or Responses API docs. 

In addition, all responses must be STREAMING. Always. 

- Responses API Docs: https://platform.openai.com/docs/guides/migrate-to-responses
- GPT-5 Docs: https://platform.openai.com/docs/guides/latest-model

---

Most importantly - DO NOT EVER FAKE/MOCK/STUB anything ever. This will not be a short cut to passing a test, it's a shortcut to failure. We only work with real, actual scenarios.

--- 

DO NOT EVER report a test having been passed when it wasn't actually run. A test being written is not the same as a test being run and passing.

---

WE are working off of `/Users/marklerner/Research_Agent_Platform_wndsrf/docs/migration_and_visual_iterative_testing_and_updating_plan.md` make sure you are going through the requirements exactly as proposed.

--

No faking tests. Ever. If something isn't working, dont just create a test result - deal with the underlying issue. Eg: If the MCP playwright server is down, try Puppeteer or figure out what the issue is. 