/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Next.js limita el body de una Server Action a 1MB por default — por
      // debajo de la validación de MAX_PROFILE_IMAGE_BYTES (5MB) en
      // account/actions.ts. Sin esto, subir una foto de entre 1MB y 5MB no
      // llega ni a correr esa validación: el framework corta la conexión
      // antes, y el navegador lo reporta como "Failed to fetch" en vez de un
      // error prolijo. 6mb da margen para que la validación de la app (5MB)
      // sea la que realmente decide, no el límite del framework.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
