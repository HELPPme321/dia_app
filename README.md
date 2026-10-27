# Dia+

Dia+ is a storefront for considered everyday essentials. The application source lives in the dia-web-app folder.

## Run it locally

See the complete setup and authentication guide in dia-web-app/README.md. Requires Node.js 20+.

PowerShell:

    cd dia-web-app
    Copy-Item .env.example .env
    npm.cmd install
    npm.cmd run check
    npm.cmd test
    npm.cmd start

Open http://localhost:3000.

The app supports normal email/password accounts, optional Google sign-in, and a separate administrator login. Configure Google credentials only if you want Google sign-in; standard registration and login work without Google. Password recovery email delivery is not configured yet, and checkout remains a demo.

Do not commit .env or real credentials.
