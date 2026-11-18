# Security Policy

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities in a public issue. Contact the repository maintainer privately through the contact method configured on the GitHub repository. Include a description, impact, reproduction steps and any suggested mitigation. Do not include live API keys or personal data.

## Secret handling

- Keep provider keys in the backend `.env` file or backend secret manager.
- Never expose provider keys through `VITE_*` variables or frontend code.
- Do not commit `.env`, logs containing credentials, or private deployment details.
- Restrict production CORS to trusted frontend origins.
- Apply rate limiting and provider spending controls to public deployments.
