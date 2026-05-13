-- ===================================================================
-- Seed inicial de report_templates — templates clínicos comuns
-- ===================================================================
-- A tabela report_templates existe desde 2026-02-25 mas nunca foi
-- populada — laudistas tinham que escrever cada laudo do zero.
-- Aqui semeamos 6 templates cobrindo os exames de imagem mais
-- pedidos (raio-X, US, ECG, TC). Idempotente: só insere se não houver
-- template com o mesmo title.
-- ===================================================================

-- Resolve um user_id de admin pra ser o created_by inicial (NOT NULL).
-- Se não houver admin, usa o primeiro user de qualquer role.
DO $$
DECLARE
  v_admin_id uuid;
  v_count int;
BEGIN
  SELECT user_id INTO v_admin_id
    FROM public.user_roles
   WHERE role = 'admin'
   ORDER BY created_at ASC NULLS LAST
   LIMIT 1;

  IF v_admin_id IS NULL THEN
    SELECT user_id INTO v_admin_id FROM public.user_roles LIMIT 1;
  END IF;

  -- Sem nenhum usuário, abortar (banco vazio — só dev fresh).
  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'Nenhum usuário no banco — pulando seed de report_templates';
    RETURN;
  END IF;

  -- Quantos já existem (idempotência)
  SELECT COUNT(*) INTO v_count FROM public.report_templates;
  IF v_count > 0 THEN
    RAISE NOTICE 'report_templates já tem % linhas — pulando seed', v_count;
    RETURN;
  END IF;

  INSERT INTO public.report_templates (title, exam_type, body_text, created_by, is_active) VALUES
  (
    'Raio-X de Tórax PA + Perfil',
    'raio-x-torax',
    E'INDICAÇÃO CLÍNICA:\n[descrever motivo da solicitação]\n\nTÉCNICA:\nRadiografias do tórax nas incidências PA e perfil esquerdo, em inspiração máxima.\n\nACHADOS:\n- Estruturas ósseas (arcos costais, clavículas, coluna torácica): [normal/alterado]\n- Partes moles: [normal/alterado]\n- Mediastino: contornos, dimensões — [dentro dos limites da normalidade]\n- Hilos pulmonares: [topografia e densidade preservadas]\n- Campos pulmonares: transparência [normal], sem opacidades suspeitas\n- Seios costofrênicos: [livres]\n- Cúpulas diafragmáticas: [contornos preservados]\n- Área cardíaca: índice cardiotorácico [< 0,5]\n\nIMPRESSÃO DIAGNÓSTICA:\nExame radiográfico do tórax dentro dos limites da normalidade.\n\n[OU: alteração X compatível com Y; sugere-se correlação clínica/complementar com Z]',
    v_admin_id,
    true
  ),
  (
    'Ultrassonografia de Abdome Total',
    'us-abdome-total',
    E'INDICAÇÃO CLÍNICA:\n[descrever motivo da solicitação]\n\nTÉCNICA:\nExame realizado com transdutor convexo de 3,5 MHz após jejum de 8 horas.\n\nACHADOS:\nFígado: dimensões [normais], contornos regulares, parênquima homogêneo, ecogenicidade preservada. Sem evidência de lesões focais.\nVias biliares: não dilatadas.\nVesícula biliar: paredes finas, sem cálculos no seu interior.\nPâncreas: dimensões e ecogenicidade normais.\nBaço: dimensões e ecotextura preservadas.\nRins: dimensões e topografia normais, relação parênquima/seio renal preservada, sem dilatação pielocalicial ou cálculos.\nBexiga: paredes finas, conteúdo anecóico, sem alterações.\nAorta abdominal: calibre normal.\n\nIMPRESSÃO DIAGNÓSTICA:\nExame ultrassonográfico abdominal sem alterações significativas.\n\n[OU: alterações conforme descritas — sugerir conduta]',
    v_admin_id,
    true
  ),
  (
    'Eletrocardiograma de Repouso (ECG)',
    'ecg',
    E'INDICAÇÃO CLÍNICA:\n[descrever motivo da solicitação]\n\nTÉCNICA:\nECG de 12 derivações em repouso.\n\nACHADOS:\n- Ritmo: sinusal\n- Frequência cardíaca: [00] bpm\n- Eixo elétrico do QRS: [00°]\n- Intervalos: PR [120-200 ms], QRS [< 120 ms], QT/QTc [normal]\n- Ondas P: morfologia e duração normais\n- Complexos QRS: morfologia e duração normais, sem ondas Q patológicas\n- Segmento ST: isoelétrico\n- Ondas T: positivas onde esperado\n\nIMPRESSÃO DIAGNÓSTICA:\nECG de repouso dentro dos limites da normalidade.\n\n[OU: descrever alterações — bloqueio, sobrecarga, alteração de repolarização — e sugerir correlação clínica]',
    v_admin_id,
    true
  ),
  (
    'Ultrassonografia Obstétrica',
    'us-obstetrica',
    E'INDICAÇÃO CLÍNICA:\n[idade gestacional / motivo]\n\nTÉCNICA:\nExame realizado com transdutor convexo abdominal.\n\nACHADOS:\nÚtero: gestação tópica de feto único, vivo.\nIdade gestacional pelo BCF/biometria: [00] semanas e [0] dias.\nApresentação: [cefálica/pélvica/córmica].\nBatimentos cardíacos fetais: presentes e regulares — [00] bpm.\nMovimentos fetais: presentes.\nLíquido amniótico: volume [normal — ILA] mm.\nPlacenta: inserção [anterior/posterior/fúndica], grau [0/I/II/III] de Grannum, sem sinais de descolamento.\nCordão umbilical: três vasos.\nBiometria fetal:\n- DBP: [00] mm\n- CC: [00] mm\n- CA: [00] mm\n- CF: [00] mm\n- Peso fetal estimado: [0000] g (percentil [00])\n\nIMPRESSÃO DIAGNÓSTICA:\nGestação tópica de feto único vivo, [idade gestacional] semanas, em apresentação [...].\n[OU: alteração X — sugerir conduta]',
    v_admin_id,
    true
  ),
  (
    'Tomografia Computadorizada de Crânio',
    'tc-cranio',
    E'INDICAÇÃO CLÍNICA:\n[descrever motivo — cefaleia, trauma, AVC]\n\nTÉCNICA:\nCortes axiais de 5 mm sem injeção de contraste iodado.\n\nACHADOS:\n- Parênquima cerebral: hipoatenuação/hiperatenuação compatíveis com a normalidade, diferenciação córtico-subcortical preservada.\n- Sistema ventricular: dimensões e topografia normais, sem desvio de linha média.\n- Cisternas da base: livres.\n- Sulcos corticais: amplitude compatível com a idade.\n- Não há sinais de coleções hemorrágicas extra ou intra-axiais.\n- Estruturas ósseas: sem fraturas ou lesões líticas/blásticas evidentes.\n- Seios paranasais: pneumatização preservada.\n- Mastoides: pneumatização preservada.\n\nIMPRESSÃO DIAGNÓSTICA:\nTomografia computadorizada do crânio sem alterações significativas.',
    v_admin_id,
    true
  ),
  (
    'Ultrassonografia de Tireoide',
    'us-tireoide',
    E'INDICAÇÃO CLÍNICA:\n[descrever motivo da solicitação]\n\nTÉCNICA:\nExame realizado com transdutor linear de alta frequência.\n\nACHADOS:\nLobo direito: dimensões [00 x 00 x 00] mm, volume [0,0] cm³. Parênquima homogêneo, ecogenicidade preservada.\nLobo esquerdo: dimensões [00 x 00 x 00] mm, volume [0,0] cm³. Parênquima homogêneo, ecogenicidade preservada.\nIstmo: espessura [0,0] mm.\nVolume total da glândula: [00,0] cm³ (referência: 7-20 cm³).\nSem evidência de nódulos.\nCadeias linfonodais cervicais sem linfonodopatias detectáveis ao método.\n\nIMPRESSÃO DIAGNÓSTICA:\nUltrassonografia da tireoide sem alterações significativas.\n\n[Se houver nódulo: descrever conforme classificação TI-RADS]',
    v_admin_id,
    true
  );

  RAISE NOTICE 'Seed de report_templates concluído: 6 templates iniciais';
END $$;
