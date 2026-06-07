---
name: find-docs
description: >-
  Retrieves up-to-date documentation, API references, and code examples for any
  developer technology. Use this skill whenever the user asks about a specific
  library, framework, SDK, CLI tool, or cloud service -- even for well-known ones.
  Your training data may not reflect recent API changes or version updates.

  Always use for: API syntax questions, configuration options, version migration
  issues, "how do I" questions mentioning a library name, debugging that involves
  library-specific behavior, setup instructions, and CLI tool usage.

  Use even when you think you know the answer -- do not rely on training data
  for API details, signatures, or configuration options as they are frequently
  outdated. Always verify against current docs. Prefer this over web search for
  library documentation and API details.
---

# Documentation Lookup

- Prioritize local headers, man pages, upstream docs, and standards.
- Do not install or execute package-manager-delivered tooling merely to read documentation.

## Workflow

1. Identify the technology/library.
2. Prefer local authoritative sources:
   - headers under `/usr/include`
   - man pages: `man`, `apropos`
   - info pages
   - pkg-config metadata
   - project docs already vendored in the repository
   - installed examples
3. If local docs are insufficient, fetch primary upstream documentation using read-only HTTP tools:
   - official project website
   - official source repository
   - standards documents
   - distribution package source/docs
   - webfetch currently only works for the following domains:
     en.cppreference.com, stackoverflow.com, www.geeksforgeeks.org, invisible-island.net, docs.oracle.com, man.archlinux.org,
     cmake.org, man7.org, refspecs.linuxfoundation.org, sourceware.org
     If you need access to any one domain, please ask the user to add it.
4. For C/C++ system libraries, prefer:
   - installed headers
   - man pages
   - upstream source comments/docs
   - relevant standards/specifications
5. For API behavior, verify with:
   - small local test programs
   - existing tests
   - `readelf`, `objdump`, `dwarfdump`, etc., where applicable
