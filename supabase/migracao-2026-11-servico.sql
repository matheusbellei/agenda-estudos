-- Correção de 24/11/2026: acesso da função "lembretes" ao banco.
-- Nos projetos novos do Supabase, as tabelas criadas no SQL Editor não dão acesso automático à chave de serviço
-- (service_role), que é a que a função usa. Sem isto, "Enviar teste" e os avisos falham com
-- "permission denied for table push_subscriptions". Pode rodar de novo sem problema.
-- A chave de serviço só existe dentro do Supabase (segredo da função); o app no navegador nunca a tem.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
-- Tabelas criadas daqui para frente também.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
