INSERT INTO products (id, code, name, kind, is_active)
VALUES
    ('10000000-0000-4000-8000-000000000001', 'BUS', 'Ônibus', 'BUS', FALSE),
    ('10000000-0000-4000-8000-000000000003', 'CAMISETA_NORMAL', 'Camiseta Normal', 'CAMISETA', FALSE),
    ('10000000-0000-4000-8000-000000000004', 'CAMISETA_LIBERO', 'Camiseta Líbero', 'CAMISETA', FALSE)
ON CONFLICT DO NOTHING;

INSERT INTO restricted_numbers (number, is_active)
VALUES
    (13, TRUE),
    (22, TRUE),
    (14, TRUE),
    (69, TRUE),
    (55, TRUE),
    (30, TRUE),
    (70, TRUE)
ON CONFLICT (number) DO NOTHING;

INSERT INTO restricted_name_patterns (id, category, normalized_pattern, is_active)
VALUES
    ('20000000-0000-4000-8000-000000000001', 'political_propaganda', 'vote em', TRUE),
    ('20000000-0000-4000-8000-000000000002', 'political_propaganda', 'vote no', TRUE),
    ('20000000-0000-4000-8000-000000000003', 'political_propaganda', 'vote na', TRUE),
    ('20000000-0000-4000-8000-000000000004', 'political_propaganda', 'vote para', TRUE),
    ('20000000-0000-4000-8000-000000000005', 'political_propaganda', 'apoie candidato', TRUE),
    ('20000000-0000-4000-8000-000000000006', 'political_propaganda', 'apoie candidata', TRUE),
    ('20000000-0000-4000-8000-000000000007', 'political_propaganda', 'campanha politica', TRUE),
    ('20000000-0000-4000-8000-000000000008', 'political_propaganda', 'propaganda politica', TRUE),
    ('20000000-0000-4000-8000-000000000010', 'criminal_organization', 'organizacao criminosa', TRUE),
    ('20000000-0000-4000-8000-000000000011', 'criminal_organization', 'faccao criminosa', TRUE),
    ('20000000-0000-4000-8000-000000000012', 'criminal_organization', 'comando criminoso', TRUE),
    ('20000000-0000-4000-8000-000000000013', 'criminal_organization', 'trafico de drogas', TRUE),
    ('20000000-0000-4000-8000-000000000014', 'illicit_drugs', 'legalize maconha', TRUE),
    ('20000000-0000-4000-8000-000000000015', 'illicit_drugs', 'legaliza maconha', TRUE),
    ('20000000-0000-4000-8000-000000000016', 'illicit_drugs', 'uso de cocaina', TRUE),
    ('20000000-0000-4000-8000-000000000017', 'illicit_drugs', 'venda de cocaina', TRUE),
    ('20000000-0000-4000-8000-000000000018', 'illicit_drugs', 'venda de maconha', TRUE),
    ('20000000-0000-4000-8000-000000000019', 'illicit_drugs', 'fume maconha', TRUE),
    ('20000000-0000-4000-8000-000000000020', 'pornography', 'pornografia explicita', TRUE),
    ('20000000-0000-4000-8000-000000000021', 'pornography', 'sexo explicito', TRUE),
    ('20000000-0000-4000-8000-000000000022', 'pornography', 'conteudo sexual explicito', TRUE)
ON CONFLICT (category, normalized_pattern) DO NOTHING;

-- Products remain inactive until real commercial variants, prices and stock are configured.
-- Class and modality choices are intentionally not seeded because no approved values were provided.
