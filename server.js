// ============================================================
// ROTA PARA LISTAR ARQUIVOS DE UMA PASTA NO S3
// ============================================================
app.get('/api/gallery/list/:folder', async (req, res) => {
  const { folder } = req.params;
  const bucketName = process.env.S3_BUCKET_NAME;
  
  try {
    const params = {
      Bucket: bucketName,
      Prefix: folder + '/', // Ex: "videos/" ou "fotos/"
      Delimiter: '/'
    };
    
    const data = await s3.listObjectsV2(params).promise();
    
    // Filtra apenas os arquivos (não pastas)
    const files = data.Contents
      .filter(item => item.Key !== folder + '/') // Remove a própria pasta
      .map(item => {
        const filename = item.Key.replace(folder + '/', '');
        return {
          key: item.Key,
          filename: filename,
          size: item.Size,
          lastModified: item.LastModified
        };
      });
    
    return res.json({
      success: true,
      folder: folder,
      count: files.length,
      files: files
    });
    
  } catch (error) {
    console.error(`❌ Erro ao listar arquivos da pasta ${folder}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar arquivos.'
    });
  }
});
