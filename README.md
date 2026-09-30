# College MOU Management System

## Local setup and verification

Prerequisites: Node.js 20 or newer and MySQL 8. Create separate `college_mou_dev` and `college_mou_test` databases. Copy `server/.env.example` to `server/.env` and use a least privilege local database user. Never commit `.env` or put server credentials in `client/.env`/`VITE_*` variables. The client example only configures the public API URL.

Install packages separately with `npm ci` in `server/` and `client/`. Run `npm run migrate` from `server/` to apply ordered, checksummed migrations. Test migrations only against a dedicated test database. Review [database/migrations/README.md](database/migrations/README.md) before a production upgrade; the runner requires explicit approval flags and rejects destructive statements.

Start the API with `npm run dev` from `server/` and the UI with `npm run dev` from `client/`. Create the first Admin using the trusted server environment variables `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then run `node create-admin.js` from `server/`; this script refuses to overwrite an existing account and does not print the password.

Tests require `NODE_ENV=test` and a dedicated database name containing `test` (for example `college_mou_test`). Set `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, and `TEST_DB_PASSWORD` when test credentials differ from development; the `__EMPTY__` password sentinel is only for a disposable local MySQL instance. Run `npm test` from `server/` for validation, migration, shared rate limit, and HTTP integration tests. Run `npm run lint`, `npm run build`, and `npm run test:e2e` from `client/`. Browser tests also require `E2E_ADMIN_EMAIL` and a 16+ character `E2E_ADMIN_PASSWORD`; seed that test fixture with `npm run test:e2e:seed` from `server/`.

A full-stack application for managing  Memorandums of Understanding (MOUs), related projects, students, interns, documents, and dashboard activity. The system is built with a React frontend, an Express backend, and a MySQL database. The only application roles are Admin and Viewer. Public signup always creates a Viewer.

## Project purpose

This project helps track:
- MOUs and their validity dates
- Partner colleges and departments
- Related projects and interns
- Uploaded supporting documents
- Excel/CSV imports for bulk data entry
- Dashboard metrics and recent activity
- Admin profile management
- Notifications based on MOU/project date status

## Tech stack

### Frontend
- React 19
- Vite
- React Router DOM
- Axios
- React Hot Toast
- Recharts
- jsPDF
- Lucide React
- date-fns

Location:
- client/
- client/src/

### Backend
- Node.js
- Express
- MySQL2
- JWT (JSON Web Tokens)
- bcryptjs
- multer
- ExcelJS
- dotenv
- cors

Location:
- server/
- server/app.js
- server/routes/
- server/middleware.js
- server/db.js

### Database
- MySQL
- Versioned forward migrations are stored in `database/migrations/`.

## Folder structure

```text
college-mou-management/
├── client/
│   ├── src/
│   ├── package.json
│   └── vite.config.*
├── server/
│   ├── routes/
│   ├── storage/
│   ├── .env.example
│   ├── app.js
│   ├── db.js
│   ├── middleware.js
│   └── package.json
├── database/
│   ├── migrations/
│   └── schema.sql (reference only)
├── README.md
└── .gitignore
```

## What each folder does

### client/
This is the user interface.

Main files:
- client/src/App.jsx: root application entry
- client/src/routes/AppRoutes.jsx: route definitions and protected route setup
- client/src/context/AuthContext.jsx: login/auth state handling
- client/src/pages/: page components such as Dashboard, MOUs, Projects, Interns, Documents, Reports, Notifications, Profile
- client/src/components/: reused UI elements like Navbar, Sidebar, layout wrappers, and buttons
- client/src/services/: Axios API wrappers for backend endpoints

### server/
This is the backend API and business logic.

Main files:
- server/app.js: Express app startup and route registration
- server/db.js: MySQL pool configuration
- server/middleware.js: JWT auth and admin access middleware
- server/routes/auth.js: login and profile APIs
- server/routes/mous.js: MOU CRUD logic
- server/routes/projects.js: project CRUD/import logic
- server/routes/resources.js: documents, reports, Excel import, and some utility endpoints
- server/storage/: local storage adapter, ready for a future storage provider
- server/.env: local-only environment variables (never committed)

### database/
This holds the versioned MySQL migrations and legacy schema reference.

## Environment setup

Create or update the file:
- server/.env

Example structure:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=college_mou_dev
PORT=4000
JWT_SECRET=your-secret-key
NODE_ENV=development
```

Note:
- The MySQL password may contain special characters. Use the correct escaping/format expected by your environment.
- Keep credentials secure and do not commit production secrets to version control.

## Prerequisites

You need:
- Node.js 20+ recommended
- MySQL server running locally or in your environment
- Separate development and test databases (or update DB_NAME in .env)

## Installation

Install each package independently:

```bash
cd client
npm ci
cd ../server
npm ci
```

## How to run the project

### 1) Start the backend
From server/:

```bash
cd server
npm start
```

For development with auto-reload:

```bash
cd server
npm run dev
```

### 2) Start the frontend
From client/:

```bash
cd client
npm run dev
```

This typically starts the app at:
- Frontend: http://localhost:5173
- Backend: http://localhost:4000

## Administrator setup

There is no hardcoded default login. Create an administrator using the local setup script after applying the database migration:

```bash
cd server
node create-admin.js
```

Use the credentials supplied during setup, and keep them private.

## Account signup

Users can create Viewer accounts from `/signup`. The server ignores caller supplied roles. Administrator accounts are provisioned separately through `server/create-admin.js` using trusted server environment variables.

## Main features implemented

### MOU management
- Create, view, edit, delete MOU records
- MOU fields include: college, department, dates, purpose, activities, students benefited, contact person, contact email, etc.
- MOU detail page includes document and project-related context
- PDF export of MOU details

### Project management
- Create/update/delete projects
- Link projects to specific MOU records
- Excel/CSV import for project list bulk import

### Intern management
- Manage interns linked to MOU and student records
- Display student names in intern-related flows

### Documents
- Upload documents attached to an MOU
- Metadata includes document type, version, document date, expiry date, required flag, remarks
- File validation for supported file types
- Local file storage through `server/storage/`; files are not served from public static paths
- Production uploads remain disabled until a malware scanner module is configured

### Dashboard
- Total MOU/project/intern metrics
- Recent activity list
- MOU status distribution based on live data
- Dashboard quick actions and import button

### Notifications
- Date-driven notifications for MOU and project deadlines/status changes
- Scheduled reminders run at 90, 30, and 7 days before deadlines without duplicates

## Database migration

Use the versioned migration runner described in `database/migrations/README.md`. The legacy `database/migration_qa_hardening.sql` and `database/schema.sql` are reference artifacts and are not a production upgrade path.

## Import workflow

The authenticated Excel Import page validates a file first without writing. Confirmation uploads it again; the server validates it a second time before committing the transaction. Invalid rows return row-level errors and no rows from that batch are inserted.

### Profile
- Admin profile page with editable fields
- Profile update saves to the backend database

### Excel import
- CSV/XLSX import support for bulk MOU/project-related data
- Dashboard includes a single upload action for Excel import

## Database and backend logic

### Database connection
The backend uses MySQL connection pooling from:
- server/db.js

### API structure
The backend exposes APIs under:
- /api/auth
- /api/colleges
- /api/departments
- /api/mous
- /api/projects
- /api/documents
- /api/reports
- /api/excel

### Auth
- JWT-based authentication is implemented in:
  - server/middleware.js
  - server/routes/auth.js

### Protected routes
Routes are guarded with authorization checks so authenticated users must have valid tokens to access protected data.

## How the app works

1. Frontend sends requests to the backend using Axios service modules in client/src/services.
2. Backend validates request data, checks JWT tokens, and uses MySQL queries.
3. Data is inserted/updated/read from the configured MySQL database.
4. Uploaded documents are stored through the local storage adapter and their storage key is saved in the database.
5. Dashboard and page logic aggregate data from API responses and render them in the React UI.

## Important project files

### Frontend
- client/src/routes/AppRoutes.jsx — app routes and protected paths
- client/src/context/AuthContext.jsx — auth state
- client/src/pages/Dashboard.jsx — dashboard summary and import logic
- client/src/pages/Documents.jsx — document vault UI
- client/src/pages/MOUs.jsx — MOU list and display
- client/src/pages/CreateMOU.jsx — create MOU form
- client/src/pages/EditMOU.jsx — edit MOU form
- client/src/pages/Profile.jsx — profile edit/view screen

### Backend
- server/app.js — start Express server and register routes
- server/routes/resources.js — document, report, and Excel import logic
- server/routes/auth.js — auth/login/profile endpoints
- server/routes/mous.js — MOU CRUD logic
- server/routes/projects.js — project routes

### Database
- database/migrations/ — ordered, checksummed forward migrations

## Notes and conventions

- The project is designed for a local development environment and uses MySQL as the main database.
- Uploaded storage keys are stored in the database, while file bytes are managed through `server/storage/`.
- The React app uses route-based navigation and component-based UI composition.
- Many pages are designed to resemble an internal  admin dashboard for MOU management.

## Common commands

### Install all dependencies
```bash
cd college-mou-management
cd client && npm ci
cd ../server && npm ci
```

### Run frontend
```bash
cd client
npm run dev
```

### Run backend
```bash
cd server
npm start
```

### Build frontend for production
```bash
cd client
npm run build
```

## Troubleshooting

- If login fails, verify that the MySQL database is running and the .env credentials match the actual DB user/password.
- If a frontend page is blank or broken, check the browser console and confirm the backend is running on port 4000.
- If MySQL data imports fail, check Excel/CSV headers, date formats, and required fields.

## Summary

This project is a college MOU management portal with a React frontend, Express API, and MySQL database. It covers operational requirements such as MOU tracking, project/intern linking, document upload, dashboard analytics, notifications, Excel import, and admin profile management, making it suitable for internal institutional use in a local development setup.

## API endpoint overview

### Authentication
- POST /api/auth/login
- GET /api/auth/me
- PUT /api/auth/profile

### Colleges and departments
- GET /api/colleges
- POST /api/colleges
- PUT /api/colleges/:id
- DELETE /api/colleges/:id
- GET /api/departments
- POST /api/departments
- PUT /api/departments/:id
- DELETE /api/departments/:id

### MOUs
- GET /api/mous
- POST /api/mous
- GET /api/mous/:id
- PUT /api/mous/:id
- DELETE /api/mous/:id

### Projects
- GET /api/projects
- POST /api/projects
- PUT /api/projects/:id
- DELETE /api/projects/:id
- POST /api/projects/import

### Interns and students
- GET /api/interns
- POST /api/interns
- PUT /api/interns/:id
- DELETE /api/interns/:id
- GET /api/students
- POST /api/students
- PUT /api/students/:id
- DELETE /api/students/:id

### Documents
- GET /api/documents
- POST /api/documents/upload
- DELETE /api/documents/:id

### Reports and Excel
- GET /api/reports
- GET /api/reports/export/:type
- POST /api/excel/import

## Sample database schema overview

```text
users
  ├── id
  ├── name
  ├── email
  ├── password_hash
  ├── role
  ├── age
  ├── gender
  ├── phone
  ├── department
  ├── designation
  ├── address
  └── created_at / updated_at

colleges
  ├── id
  ├── name
  ├── short_name
  ├── address
  ├── city
  ├── state
  ├── country
  ├── contact_person
  ├── email
  └── phone

departments
  ├── id
  ├── college_id -> colleges.id
  ├── name
  └── created_at

mous
  ├── id
  ├── serial_no
  ├── national_or_international
  ├── college_id -> colleges.id
  ├── department_id -> departments.id
  ├── mou_date
  ├── valid_upto
  ├── purpose
  ├── activities
  ├── students_benefited
  ├── contact_name
  ├── contact_designation
  ├── contact_email
  ├── contact_phone
  └── created_at / updated_at

students
  ├── id
  ├── name
  ├── email
  ├── phone
  ├── college_id -> colleges.id
  ├── department_id -> departments.id
  └── created_at

interns
  ├── id
  ├── mou_id -> mous.id
  ├── student_id -> students.id
  ├── start_date
  ├── end_date
  ├── status
  └── created_at / updated_at

projects
  ├── id
  ├── mou_id -> mous.id
  ├── title
  ├── description
  ├── start_date
  ├── end_date
  ├── status
  └── created_at / updated_at

documents
  ├── id
  ├── mou_id -> mous.id
  ├── title
  ├── document_name
  ├── document_type
  ├── file_path
  ├── file_type
  ├── version
  ├── document_date
  ├── expiry_date
  ├── required
  ├── remarks
  ├── uploaded_by -> users.id
  └── uploaded_at

import_logs
  ├── id
  ├── filename
  ├── imported_by
  ├── inserted_count
  ├── skipped_count
  ├── error_count
  ├── details
  └── created_at
```

```
