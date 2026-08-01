-- Nunca llegamos a usar Mercado Pago (no hay filas reales con este valor),
-- así que es seguro renombrar en vez de migrar datos.
ALTER TYPE "PaymentProvider" RENAME VALUE 'MERCADOPAGO' TO 'WOMPI';
