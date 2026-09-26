from pathlib import Path
import logging
import fitz  # PyMuPDF
from PIL import Image  # Adicionado para salvar corretamente em WebP


# ============================================================
# CONFIGURAÇÕES
# ============================================================

# Pasta onde estão os PDFs
PASTA_PDFS = Path("certificados")

# Pasta onde todas as imagens WebP serão salvas
PASTA_DESTINO = Path("certificados_webp")

# Qualidade das imagens WebP
QUALIDADE = 85

# Resolução da conversão
DPI = 150

# Arquivo de log
ARQUIVO_LOG = "conversao.log"


# ============================================================
# CONFIGURAÇÃO DO LOG
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(
            ARQUIVO_LOG,
            encoding="utf-8"
        ),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)


# ============================================================
# VALIDAÇÃO
# ============================================================

def validar_configuracoes():

    logger.info("Validando configurações...")

    if not PASTA_PDFS.exists():
        logger.error(
            "A pasta de origem não existe: %s",
            PASTA_PDFS.resolve()
        )
        return False

    if not PASTA_PDFS.is_dir():
        logger.error(
            "O caminho de origem não é uma pasta: %s",
            PASTA_PDFS.resolve()
        )
        return False

    if DPI <= 0:
        logger.error("O DPI precisa ser maior que zero.")
        return False

    if not 1 <= QUALIDADE <= 100:
        logger.error(
            "A qualidade precisa estar entre 1 e 100."
        )
        return False

    logger.info("Configurações válidas.")

    return True


# ============================================================
# CONVERSÃO DE PDF
# ============================================================

def converter_pdf(pdf):

    logger.info("Iniciando: %s", pdf.name)

    documento = None
    paginas_convertidas = 0

    try:

        # Abre o PDF
        documento = fitz.open(pdf)

        quantidade_paginas = len(documento)

        logger.info(
            "%s possui %d página(s).",
            pdf.name,
            quantidade_paginas
        )

        if quantidade_paginas == 0:

            logger.warning(
                "PDF vazio: %s",
                pdf.name
            )

            return 0

        # Calcula a escala
        escala = DPI / 72

        matriz = fitz.Matrix(
            escala,
            escala
        )

        # ----------------------------------------------------
        # PROCESSAMENTO DAS PÁGINAS
        # ----------------------------------------------------

        for numero, pagina in enumerate(
            documento,
            start=1
        ):

            try:

                logger.info(
                    "Processando página %d/%d: %s",
                    numero,
                    quantidade_paginas,
                    pdf.name
                )

                # Renderiza a página forçando ausência de fundo transparente (alpha=False)
                imagem = pagina.get_pixmap(
                    matrix=matriz,
                    alpha=False
                )

                # Nome do arquivo
                arquivo_saida = (
                    PASTA_DESTINO /
                    f"{pdf.stem}_pagina_{numero:03d}.webp"
                )

                # ------------------------------------------------
                # CONVERSÃO PARA WEBP COM PILLOW
                # ------------------------------------------------

                # Converte os bytes brutos do PyMuPDF para um objeto de imagem do Pillow
                img_pil = Image.frombytes(
                    "RGB",
                    [imagem.width, imagem.height],
                    imagem.samples
                )

                # Salva o arquivo diretamente com o Pillow aplicando a qualidade
                img_pil.save(
                    arquivo_saida,
                    format="WEBP",
                    quality=QUALIDADE
                )

                paginas_convertidas += 1

                logger.info(
                    "✓ Gerado: %s",
                    arquivo_saida.name
                )

            except Exception:

                logger.exception(
                    "Erro ao converter página %d do PDF %s",
                    numero,
                    pdf.name
                )

        logger.info(
            "Finalizado: %s | %d/%d página(s)",
            pdf.name,
            paginas_convertidas,
            quantidade_paginas
        )

        return paginas_convertidas

    except Exception:

        logger.exception(
            "Erro ao abrir/processar PDF: %s",
            pdf.name
        )

        return 0

    finally:

        if documento is not None:

            try:

                documento.close()

                logger.debug(
                    "Documento fechado: %s",
                    pdf.name
                )

            except Exception:

                logger.exception(
                    "Erro ao fechar PDF: %s",
                    pdf.name
                )


# ============================================================
# FUNÇÃO PRINCIPAL
# ============================================================

def main():

    logger.info("=" * 70)
    logger.info("INICIANDO CONVERSÃO PDF → WEBP")
    logger.info("=" * 70)

    logger.info(
        "Origem: %s",
        PASTA_PDFS.resolve()
    )

    logger.info(
        "Destino: %s",
        PASTA_DESTINO.resolve()
    )

    logger.info(
        "DPI: %d | Qualidade: %d",
        DPI,
        QUALIDADE
    )

    # --------------------------------------------------------
    # VALIDA CONFIGURAÇÕES
    # --------------------------------------------------------

    if not validar_configuracoes():

        logger.error(
            "Configuração inválida. Encerrando."
        )

        return

    # --------------------------------------------------------
    # CRIA DESTINO
    # --------------------------------------------------------

    try:

        PASTA_DESTINO.mkdir(
            parents=True,
            exist_ok=True
        )

        logger.info(
            "Pasta de destino pronta."
        )

    except OSError:

        logger.exception(
            "Não foi possível criar a pasta de destino."
        )

        return

    # --------------------------------------------------------
    # PROCURA PDFs
    # --------------------------------------------------------

    try:

        pdfs = list(
            PASTA_PDFS.glob("*.pdf")
        )

    except Exception:

        logger.exception(
            "Erro ao procurar PDFs."
        )

        return

    if not pdfs:

        logger.warning(
            "Nenhum PDF encontrado em: %s",
            PASTA_PDFS.resolve()
        )

        return

    logger.info(
        "Encontrados %d PDF(s).",
        len(pdfs)
    )

    # --------------------------------------------------------
    # ESTATÍSTICAS
    # --------------------------------------------------------

    pdfs_processados = 0
    pdfs_com_erro = 0
    paginas_convertidas = 0

    # --------------------------------------------------------
    # PROCESSAMENTO
    # --------------------------------------------------------

    for indice, pdf in enumerate(
        pdfs,
        start=1
    ):

        logger.info("-" * 70)

        logger.info(
            "PDF %d/%d: %s",
            indice,
            len(pdfs),
            pdf.name
        )

        try:

            paginas = converter_pdf(pdf)

            paginas_convertidas += paginas

            if paginas > 0:

                pdfs_processados += 1

            else:

                pdfs_com_erro += 1

        except Exception:

            pdfs_com_erro += 1

            logger.exception(
                "Erro inesperado no PDF: %s",
                pdf.name
            )

    # --------------------------------------------------------
    # RELATÓRIO FINAL
    # --------------------------------------------------------

    logger.info("=" * 70)
    logger.info("CONVERSÃO CONCLUÍDA")
    logger.info("=" * 70)

    logger.info(
        "PDFs encontrados: %d",
        len(pdfs)
    )

    logger.info(
        "PDFs processados: %d",
        pdfs_processados
    )

    logger.info(
        "PDFs com erro: %d",
        pdfs_com_erro
    )

    logger.info(
        "Páginas convertidas: %d",
        paginas_convertidas
    )

    logger.info(
        "Destino: %s",
        PASTA_DESTINO.resolve()
    )

    logger.info(
        "Log: %s",
        Path(ARQUIVO_LOG).resolve()
    )

    logger.info("=" * 70)


# ============================================================
# EXECUÇÃO
# ============================================================

if __name__ == "__main__":

    try:

        main()

    except KeyboardInterrupt:

        logger.warning(
            "Programa interrompido pelo usuário."
        )

    except Exception:

        logger.exception(
            "Erro fatal não tratado."
        )