// Adicionar suporte a múltiplos buckets
const BUCKETS = {
  clientes: process.env.S3_BUCKET_NAME || 'studio-rassi-ensaios-2026',
  fornecedor: process.env.S3_BUCKET_FORNECEDOR || 'studio-rassi-fornecedor-2026'
};

// Rota para visualização com bucket dinâmico
app.get('/api/gallery/view/:bucket/:filename', (req, res) => {
  const { bucket, filename } = req.params;
  const bucketName = BUCKETS[bucket] || BUCKETS.clientes;
  
  try {
    const params = {
      Bucket: bucketName,
      Key: filename,
      Expires: 86400 // 24 horas
    };
    const url = s3.getSignedUrl('getObject', params);
    return res.redirect(url);
  } catch (error) {
    console.error(`❌ Erro ao gerar URL:`, error);
    return res.status(500).json({ success: false, message: 'Erro ao carregar imagem.' });
  }
});

// Rota de download com bucket específico
app.post('/api/gallery/download', async (req, res) => {
  const { imageKeys, bucket } = req.body;
  const bucketName = BUCKETS[bucket] || BUCKETS.clientes;
  
  try {
    const urls = imageKeys.map(key => {
      const params = {
        Bucket: bucketName,
        Key: key,
        Expires: 3600 // 1 hora para download
      };
      return {
        key: key,
        url: s3.getSignedUrl('getObject', params)
      };
    });
    return res.json({ success: true, urls });
  } catch (error) {
    console.error('❌ Erro no download:', error);
    return res.status(500).json({ success: false, message: 'Erro ao gerar link de download.' });
  }
});
