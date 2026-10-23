<?php
/**
 * backend/config/coordenadas.php — Coordenadas (centro geográfico aproximado) dos países.
 *
 * O banco `bd_mundo` não guarda latitude/longitude, então o mapa usa esta tabela
 * para posicionar cada país cadastrado pelo NOME. Países que não estiverem aqui
 * são localizados automaticamente pela Geocoding API do Google (no navegador).
 *
 * Formato de cada linha:  Nome;apelido;apelido | latitude | longitude | código ISO-2
 */

function tabelaCoordenadas(): array
{
    static $tabela = null;
    if ($tabela !== null) {
        return $tabela;
    }

    $linhas = <<<'TXT'
Brasil|-14.235|-51.925|BR
Argentina|-38.416|-63.617|AR
Chile|-35.675|-71.543|CL
Uruguai|-32.523|-55.766|UY
Paraguai|-23.442|-58.443|PY
Bolívia|-16.290|-63.589|BO
Peru|-9.190|-75.015|PE
Equador|-1.831|-78.183|EC
Colômbia|4.571|-74.297|CO
Venezuela|6.424|-66.590|VE
Guiana|4.860|-58.930|GY
Suriname|3.919|-56.028|SR
Estados Unidos;EUA;Estados Unidos da América;USA|37.090|-95.713|US
Canadá|56.130|-106.347|CA
México|23.635|-102.553|MX
Cuba|21.522|-77.781|CU
Panamá|8.538|-80.782|PA
Costa Rica|9.749|-83.753|CR
Guatemala|15.783|-90.231|GT
Honduras|15.200|-86.242|HN
Nicarágua|12.865|-85.207|NI
El Salvador|13.794|-88.897|SV
Jamaica|18.110|-77.298|JM
Haiti|18.971|-72.285|HT
República Dominicana|18.736|-70.163|DO
Porto Rico|18.221|-66.590|PR
Bahamas|25.034|-77.396|BS
Belize|17.190|-88.498|BZ
Trinidad e Tobago|10.692|-61.223|TT
Barbados|13.194|-59.543|BB
Portugal|39.400|-8.224|PT
Espanha|40.464|-3.749|ES
França|46.228|2.214|FR
Alemanha|51.166|10.452|DE
Reino Unido;Inglaterra;Grã-Bretanha|55.378|-3.436|GB
Irlanda|53.413|-8.244|IE
Itália|41.872|12.567|IT
Suíça|46.819|8.228|CH
Áustria|47.516|14.550|AT
Bélgica|50.504|4.470|BE
Países Baixos;Holanda|52.133|5.291|NL
Luxemburgo|49.815|6.130|LU
Dinamarca|56.264|9.502|DK
Noruega|60.472|8.469|NO
Suécia|60.128|18.644|SE
Finlândia|61.924|25.748|FI
Islândia|64.963|-19.021|IS
Polônia|51.919|19.145|PL
Tchéquia;República Tcheca|49.817|15.473|CZ
Eslováquia|48.669|19.699|SK
Hungria|47.162|19.503|HU
Romênia|45.943|24.967|RO
Bulgária|42.734|25.486|BG
Grécia|39.074|21.824|GR
Croácia|45.100|15.200|HR
Sérvia|44.017|21.006|RS
Eslovênia|46.151|14.995|SI
Bósnia e Herzegovina;Bósnia|43.916|17.679|BA
Albânia|41.153|20.168|AL
Macedônia do Norte;Macedônia|41.609|21.745|MK
Montenegro|42.709|19.374|ME
Kosovo|42.603|20.903|XK
Ucrânia|48.379|31.166|UA
Bielorrússia;Belarus|53.710|27.953|BY
Rússia|61.524|105.319|RU
Lituânia|55.169|23.881|LT
Letônia|56.880|24.603|LV
Estônia|58.595|25.014|EE
Moldávia|47.412|28.370|MD
Malta|35.937|14.375|MT
Chipre|35.126|33.429|CY
Mônaco|43.738|7.424|MC
Liechtenstein|47.166|9.555|LI
Andorra|42.546|1.602|AD
Vaticano;Cidade do Vaticano|41.903|12.453|VA
San Marino|43.942|12.458|SM
Japão|36.205|138.253|JP
China|35.862|104.195|CN
Índia|20.594|78.963|IN
Coreia do Sul|35.908|127.767|KR
Coreia do Norte|40.340|127.510|KP
Taiwan|23.698|120.961|TW
Mongólia|46.863|103.847|MN
Cazaquistão|48.020|66.924|KZ
Uzbequistão|41.378|64.585|UZ
Turcomenistão|38.970|59.556|TM
Quirguistão|41.204|74.766|KG
Tadjiquistão|38.861|71.276|TJ
Afeganistão|33.939|67.710|AF
Paquistão|30.375|69.345|PK
Bangladesh|23.685|90.356|BD
Nepal|28.395|84.124|NP
Butão|27.514|90.434|BT
Sri Lanka|7.874|80.772|LK
Maldivas|3.203|73.221|MV
Mianmar;Birmânia|21.914|95.956|MM
Tailândia|15.870|100.993|TH
Vietnã;Vietnam|14.058|108.277|VN
Laos|19.856|102.495|LA
Camboja|12.566|104.991|KH
Malásia|4.211|101.976|MY
Singapura|1.352|103.820|SG
Indonésia|-0.789|113.921|ID
Filipinas|12.880|121.774|PH
Brunei|4.535|114.728|BN
Timor-Leste|-8.874|125.728|TL
Irã|32.428|53.688|IR
Iraque|33.223|43.679|IQ
Síria|34.802|38.997|SY
Líbano|33.855|35.862|LB
Israel|31.046|34.851|IL
Palestina|31.952|35.233|PS
Jordânia|30.585|36.238|JO
Arábia Saudita|23.886|45.079|SA
Iêmen|15.553|48.516|YE
Omã|21.513|55.923|OM
Emirados Árabes Unidos;Emirados Árabes|23.424|53.848|AE
Catar|25.355|51.184|QA
Kuwait;Cuaite|29.312|47.482|KW
Bahrein|25.930|50.638|BH
Turquia|38.964|35.243|TR
Geórgia|42.315|43.357|GE
Armênia|40.069|45.038|AM
Azerbaijão|40.143|47.577|AZ
África do Sul|-30.559|22.938|ZA
Egito|26.821|30.802|EG
Líbia|26.335|17.228|LY
Tunísia|33.887|9.537|TN
Argélia|28.034|1.660|DZ
Marrocos|31.792|-7.093|MA
Mauritânia|21.008|-10.941|MR
Mali|17.571|-3.996|ML
Níger|17.608|8.082|NE
Chade|15.454|18.732|TD
Sudão|12.863|30.218|SD
Sudão do Sul|6.877|31.307|SS
Etiópia|9.145|40.490|ET
Eritreia|15.179|39.783|ER
Djibuti|11.825|42.590|DJ
Somália|5.152|46.200|SO
Quênia|-0.024|37.906|KE
Uganda|1.373|32.290|UG
Tanzânia|-6.369|34.889|TZ
Ruanda|-1.940|29.874|RW
Burundi|-3.373|29.919|BI
República Democrática do Congo;RD Congo;Congo (Kinshasa)|-4.038|21.759|CD
Congo;República do Congo;Congo (Brazzaville)|-0.228|15.828|CG
Gabão|-0.804|11.609|GA
Guiné Equatorial|1.651|10.268|GQ
Camarões|7.370|12.355|CM
Nigéria|9.082|8.675|NG
Benin|9.308|2.316|BJ
Togo|8.620|0.825|TG
Gana|7.947|-1.023|GH
Costa do Marfim|7.540|-5.547|CI
Libéria|6.428|-9.430|LR
Serra Leoa|8.460|-11.780|SL
Guiné|9.946|-9.697|GN
Guiné-Bissau|11.804|-15.180|GW
Senegal|14.497|-14.452|SN
Gâmbia|13.443|-15.310|GM
Cabo Verde|16.002|-24.013|CV
Burkina Faso|12.238|-1.562|BF
República Centro-Africana|6.611|20.939|CF
Angola|-11.203|17.874|AO
Zâmbia|-13.134|27.849|ZM
Zimbábue|-19.015|29.155|ZW
Moçambique|-18.666|35.530|MZ
Malaui;Malawi|-13.254|34.302|MW
Botsuana|-22.328|24.685|BW
Namíbia|-22.958|18.490|NA
Essuatíni;Suazilândia|-26.523|31.466|SZ
Lesoto|-29.610|28.234|LS
Madagascar|-18.767|46.869|MG
Maurício|-20.349|57.553|MU
Seicheles|-4.680|55.492|SC
Comores|-11.875|43.872|KM
São Tomé e Príncipe|0.186|6.613|ST
Austrália|-25.274|133.775|AU
Nova Zelândia|-40.901|174.886|NZ
Papua-Nova Guiné|-6.315|143.956|PG
Fiji|-17.714|178.065|FJ
Ilhas Salomão|-9.646|160.156|SB
Vanuatu|-15.377|166.959|VU
Samoa|-13.759|-172.105|WS
Tonga|-21.179|-175.198|TO
Kiribati|-3.370|-168.734|KI
TXT;

    $tabela = [];
    foreach (preg_split('/\R/', trim($linhas)) as $linha) {
        $partes = explode('|', $linha);
        if (count($partes) !== 4) {
            continue;
        }
        $dado = ['lat' => (float) $partes[1], 'lng' => (float) $partes[2], 'iso' => strtolower($partes[3])];
        $nomes = explode(';', $partes[0]);
        $GLOBALS['__nomes_pt_por_iso'][strtoupper($partes[3])] = trim($nomes[0]);
        foreach ($nomes as $nome) {
            $tabela[normalizarNomePais($nome)] = $dado;
        }
    }
    return $tabela;
}

/** minúsculas, sem acentos e sem pontuação extra — para comparar nomes de países */
function normalizarNomePais(string $nome): string
{
    $nome = mb_strtolower(trim($nome), 'UTF-8');
    $nome = strtr($nome, [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a',
        'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u',
        'ç' => 'c', 'ñ' => 'n',
    ]);
    return preg_replace('/\s+/', ' ', $nome) ?? $nome;
}

/** Retorna ['lat' => float, 'lng' => float, 'iso' => 'br'] ou null se o país não for conhecido */
function coordenadaPais(string $nome): ?array
{
    return tabelaCoordenadas()[normalizarNomePais($nome)] ?? null;
}

/** Nome do país em português a partir do código ISO-2 (ex.: "DE" → "Alemanha"), ou null */
function nomePtPorIso(string $iso2): ?string
{
    tabelaCoordenadas();
    return $GLOBALS['__nomes_pt_por_iso'][strtoupper($iso2)] ?? null;
}
