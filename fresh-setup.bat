@echo off
echo.
echo   frxAI Fresh Setup
echo   ==================
echo.

echo   Stopping any running dev server...
taskkill /f /im node.exe 2>nul

echo   Deleting node_modules, .next, generated files, lockfiles...
if exist node_modules rmdir /s /q node_modules
if exist .next rmdir /s /q .next
if exist src\generated rmdir /s /q src\generated
if exist bun.lock del /q bun.lock
if exist bun.lockb del /q bun.lockb
if exist package-lock.json del /q package-lock.json

echo.
echo   Installing dependencies...
call bun install
if %errorlevel% neq 0 (
    echo   bun not found, trying npm...
    call npm install
)

echo.
echo   Pushing database schema to MySQL...
call bun run db:push
if %errorlevel% neq 0 (
    call npx prisma db push
)

echo.
echo   ===================================
echo   Done! Now run:  bun run dev
echo   ===================================
echo.
pause