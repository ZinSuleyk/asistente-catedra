from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem


OUT = Path(__file__).resolve().parents[1] / "examples"
OUT.mkdir(exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CompassTitle",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=18,
    leading=22,
    textColor=colors.HexColor("#0A1833"),
    spaceAfter=14,
))
styles.add(ParagraphStyle(
    name="CompassHeading",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=12,
    leading=15,
    textColor=colors.HexColor("#3478FF"),
    spaceBefore=10,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="CompassBody",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=10.5,
    leading=15,
    textColor=colors.HexColor("#263653"),
    spaceAfter=8,
))


def p(text, style="CompassBody"):
    return Paragraph(text, styles[style])


def build(filename, title, body):
    document = SimpleDocTemplate(
        str(OUT / filename),
        pagesize=letter,
        rightMargin=0.72 * inch,
        leftMargin=0.72 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
        title=title,
        author="Classroom Compass",
    )
    story = [p(title, "CompassTitle"), p("Unidad I - Contabilidad financiera", "CompassBody"), Spacer(1, 8)]
    story.extend(body)
    document.build(story)


build("entrega-ejemplo-1-fundamentos.pdf", "Entrega de ejemplo 1 - Fundamentos de la empresa y contabilidad", [
    p("1. Empresa y actividad economica", "CompassHeading"),
    p("Una empresa organiza trabajo y capital para producir bienes o prestar servicios. La actividad economica busca obtener bienes economicos, que son limitados o requieren transformacion para ser utiles."),
    p("Ejemplo: una panaderia combina el trabajo de sus empleados, hornos e ingredientes para producir pan y venderlo a sus clientes."),
    p("2. Clasificacion", "CompassHeading"),
    ListFlowable([
        ListItem(p("Una fabrica de muebles es industrial porque transforma madera en productos.")),
        ListItem(p("Un supermercado es comercial porque actua entre productores y consumidores.")),
        ListItem(p("Un estudio contable es de servicios porque ofrece asistencia profesional.")),
    ], bulletType="bullet", leftIndent=18),
    p("3. Contabilidad financiera", "CompassHeading"),
    p("La contabilidad registra, clasifica y resume las transacciones financieras en dinero. Sirve para conocer la situacion de la empresa y sus resultados."),
    p("4. Usuarios", "CompassHeading"),
    p("Los administradores usan informacion contable para planificar y controlar operaciones. Los inversionistas y las autoridades gubernamentales son usuarios externos."),
])

build("entrega-ejemplo-2-comprobantes.pdf", "Entrega de ejemplo 2 - Objetivos y comprobantes contables", [
    p("Caso: Libreria Horizonte", "CompassHeading"),
    p("La Libreria Horizonte compra cuadernos y libros a distribuidores y los vende a estudiantes. Es una empresa comercial porque no fabrica los productos: los acerca a los consumidores."),
    p("La empresa busca obtener beneficios, pero tambien debe reponer los bienes que vende para continuar operando. Ademas, aporta a la sociedad cuando cumple sus obligaciones tributarias."),
    p("Propositos de la contabilidad", "CompassHeading"),
    ListFlowable([
        ListItem(p("Mostrar la situacion y los resultados de la empresa mediante balances y cuadros de resultados.")),
        ListItem(p("Registrar los bienes de la empresa y las deudas que tiene.")),
        ListItem(p("Controlar los bienes para reducir errores o fraudes.")),
    ], bulletType="1", leftIndent=18),
    p("Comprobante", "CompassHeading"),
    p("Cuando la libreria vende diez cuadernos, debe emitir una factura. La factura deja constancia de la operacion, muestra derechos y obligaciones de las partes y sirve de base para registrar la venta en contabilidad."),
    p("Pregunta", "CompassHeading"),
    p("Explica por que los impuestos pagados por una empresa pueden ayudar a financiar servicios publicos como hospitales y carreteras."),
])
