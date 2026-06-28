const fs = require('fs');

// 1. Update server.js — add franquicia route
const serverFile = '/home/jvh/certificadesk/server.js';
let server = fs.readFileSync(serverFile, 'utf8');

if (!server.includes('/franquicia')) {
  server = server.replace(
    'app.use("/evidencias", require("./routes/evidence"));',
    'app.use("/evidencias", require("./routes/evidence"));\napp.use("/franquicia", require("./routes/franquicia"));'
  );
  fs.writeFileSync(serverFile, server);
  console.log('server.js: franquicia route added');
} else {
  console.log('server.js: franquicia route already exists');
}

// 2. Update header.ejs — add sidebar link
const headerFile = '/home/jvh/certificadesk/views/partials/header.ejs';
let header = fs.readFileSync(headerFile, 'utf8');

if (!header.includes('/franquicia')) {
  header = header.replace(
    `<li class="nav-section">Informes</li>`,
    `<li class="nav-section">Franquicia Tributaria</li>
        <li class="nav-item">
          <a class="nav-link <%= currentPath.startsWith('/franquicia') ? 'active' : '' %>" href="/franquicia">
            <i class="bi bi-bank"></i> Acciones EyCCL
          </a>
        </li>
        <li class="nav-section">Informes</li>`
  );
  fs.writeFileSync(headerFile, header);
  console.log('header.ejs: franquicia sidebar added');
} else {
  console.log('header.ejs: franquicia link already exists');
}

console.log('DONE');
