# Third-Party Notices

This file records the direct dependencies and assets relevant to the smart-community MVP. Exact JavaScript resolutions are recorded in `frontend/package-lock.json`; exact Python requirements are recorded in `backend/pyproject.toml`.

## Local shadcn-style components

The wrappers in `frontend/src/components/ui` were independently implemented for this project around Radix UI primitives and local CSS. They follow familiar shadcn-style APIs and design conventions, but no shadcn/ui component source was copied into this repository. This project therefore does not claim that those local files are copied shadcn/ui source.

## MIT-licensed runtime dependencies

| Package | Installed version | Retained copyright notice |
|---|---:|---|
| FastAPI | 0.116.1 | Copyright 2018 Sebastián Ramírez |
| Pydantic | 2.10.6 | Copyright 2017-present Pydantic Services Inc. and individual contributors |
| pydantic-settings | 2.10.1 | Copyright 2022 Samuel Colvin and other contributors |
| SQLAlchemy | 2.0.43 | Copyright 2005-2025 SQLAlchemy authors and contributors; see upstream `AUTHORS` |
| Alembic | 1.16.5 | Copyright 2009-2025 Michael Bayer |
| PyJWT | 2.10.1 | Copyright 2015-2022 José Padilla |
| AnyIO | 4.8.0 | Copyright 2018 Alex Grönholm |
| React / React DOM | 19.2.8 / 19.2.8 | Copyright Meta Platforms, Inc. and affiliates |
| React Router DOM | 7.18.3 | Copyright React Training LLC 2015-2019; Remix Software Inc. 2020-2021; Shopify Inc. 2022-2023 |
| TanStack React Query | 5.102.8 | Copyright 2021-present Tanner Linsley |
| Radix UI React Avatar, Dialog, Dropdown Menu, Slot and Tabs | 1.2.6 / 1.1.23 / 2.1.24 / 1.3.3 / 1.1.21 | Copyright 2022 WorkOS |
| React Hook Form / resolvers | 7.87.0 / 5.9.1 | Copyright 2019-present Beier (Bill) Luo |
| React Day Picker | 9.14.0 | Copyright 2014-2025 Giampaolo Bellavite and contributors |
| date-fns | 4.4.0 | Copyright 2021 Sasha Koss and Lesha Koss |
| Zod | 4.5.4 | Copyright 2025 Colin McDonnell |
| Sonner | 2.0.8 | Copyright 2023 Emil Kowalski |
| clsx | 2.1.1 | Copyright Luke Edwards |
| tailwind-merge | 3.6.0 | Copyright 2021 Dany Castillo |

The following installed build and test tools are also MIT licensed: Tailwind CSS 4.3.3, `@tailwindcss/vite` 4.3.3, Vite 7.3.6, `@vitejs/plugin-react` 5.2.0, Vitest 3.2.7, jsdom 26.1.0, Testing Library React 16.3.3, Testing Library jest-dom 6.9.1, pytest 8.4.1, pytest-cov 6.2.1, and the installed React/Node TypeScript declaration packages.

MIT license text for the packages listed above:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The applicable copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Other direct licenses

- Lucide React 0.542.0 is ISC licensed. Copyright for Feather-derived portions is held by Cole Bemis (2013-2023); other Lucide portions are copyright Lucide Contributors (2025). Its installed `LICENSE` retains both the ISC terms and the MIT terms for Feather-derived portions.
- class-variance-authority 0.7.1 is Apache-2.0 licensed, Copyright 2022 Joe Bell.
- Playwright 1.62.1 and TypeScript 5.9.3 are Apache-2.0 licensed and retain their upstream notices, including applicable Microsoft and Google notices.
- Uvicorn 0.35.0 is BSD-3-Clause licensed, Copyright 2017-present Encode OSS Ltd; HTTPX 0.28.1 is BSD-3-Clause licensed, Copyright 2019 Encode OSS Ltd.
- Complete license texts and package-specific notices remain in each installed distribution's `LICENSE`, `LICENSE.md`, metadata, or `NOTICE` file and must accompany any redistributed dependency or bundled application where its license requires them.

## Unsplash asset

`frontend/public/community-residence.jpg` is bundled for the login screen.

- Source: https://images.unsplash.com/photo-1494526585095-c41746248156
- License: https://unsplash.com/license
- Existing asset record: `frontend/public/ASSET_LICENSES.md`

## Design references not copied

MicroCommunity, Cal, Plane and Dub informed domain or interaction research as described in the project documentation. Their source code and brand assets were not copied into this repository.
