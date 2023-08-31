const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2'); // Usando mysql2
const axios = require('axios');
const cheerio = require('cheerio');
const moment = require('moment');

const app = express();
const port = 3000;

app.use(bodyParser.json());

// Configuração do banco de dados usando mysql2
const db = mysql.createPool({
    host: '179.188.16.85',
    user: 'carlosdbvendas',
    password: 'Silvan!3121',
    database: 'carlosdbvendas'
});

// Rota de registro
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    // Verificar se o e-mail já existe na tabela
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error('Erro ao verificar e-mail existente:', err);
            res.status(500).json({ message: 'Erro ao registrar usuário.' });
        } else {
            if (results.length > 0) {
                res.status(409).json({ message: 'Endereço de e-mail já está em uso.' });
            } else {
                // Hash da senha
                const hashedPassword = await bcrypt.hash(password, 10);

                // Inserir novo usuário no banco de dados
                db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword], (err, result) => {
                    if (err) {
                        console.error('Erro ao registrar usuário:', err);
                        res.status(500).json({ message: 'Erro ao registrar usuário.' });
                    } else {
                        res.status(201).json({ message: 'Usuário registrado com sucesso.' });
                    }
                });
            }
        }
    });
});


// Rota de login
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Buscar usuário pelo email
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error('Erro ao buscar usuário:', err);
            res.status(500).json({ message: 'Erro ao fazer login.' });
        } else {
            if (results.length === 0) {
                res.status(401).json({ message: 'Credenciais inválidas.' });
            } else {
                const user = results[0];

                // Verificar a senha
                const passwordMatch = await bcrypt.compare(password, user.password);

                if (passwordMatch) {
                    // Gerar token JWT
                    const token = jwt.sign({ id: user.id }, 'chave_secreta', { expiresIn: '1h' });
                    res.json({ token });
                } else {
                    res.status(401).json({ message: 'Credenciais inválidas.' });
                }
            }
        }
    });
});

app.get('/scrape/:asin', async (req, res) => {
    const asin = req.params.asin;

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    try {
        const response = await axios.get(`https://www.amazon.com.br/dp/${asin}`, { headers });
        const $ = cheerio.load(response.data);

        const title = $('#productTitle').text();

        //const price = $('#priceblock_ourprice').text().trim();
        const divElement = $('div.a-section.a-spacing-none.aok-align-center');

        // Encontra o elemento <span> dentro do <div> com a classe especificada
        const spanElement = divElement.find('.a-price.aok-align-center.reinventPricePriceToPayMargin.priceToPay span.a-offscreen');

        // Extrai o texto do elemento <span> encontrado
        const price = spanElement.text();





        const review = $('#acrPopover').attr('title');
        const reviewNumber = $('#acrCustomerReviewText').text();

        const enviadoVendido = $('.a-size-small.tabular-buybox-text-message');
        const infos = enviadoVendido.map((_, el) => $(el).text()).get();
        const enviado = infos[1];
        const vendido = infos[2];

        let logistica = '';

        if ((enviado.includes('Amazon.com.br') || enviado.includes('Amazon')) && (vendido.includes('Amazon.com.br') || vendido.includes('Amazon'))) {
            logistica = 'FBA';
        } else if ((enviado.includes('Amazon.com.br') || enviado.includes('Amazon')) && vendido.includes(vendido)) {
            logistica = 'FBA';
        } else if (enviado === vendido && vendido === vendido) {
            logistica = 'DBA';
        }

        const quantidade = $('#quantity').text().split(' ').pop();
        const dataEntrega = $('span[data-csa-c-type="element"][data-csa-c-content-id="DEXUnifiedCXPDM"] span.a-text-bold').text();
        const marcaElement = $('#bylineInfo').text();
        const marca = marcaElement.includes('Visite a loja') ? marcaElement.split('Visite a loja').pop() : marcaElement.split('Marca:').pop().trim();

        const disponivelDesdeElement = $('tr th:contains("Disponível para compra desde") + td');
        let disponivelDesde = 'Não encontrado';
        let diasPassados = 'Não encontrado';
        let rankings = 'Não encontrado';
        let mediaVendasDia = 'Não encontrado';

        if (disponivelDesdeElement.length > 0) {
            disponivelDesde = disponivelDesdeElement.text();
            const dataFormatada = disponivelDesde.split(' ');
            const monthNames = {
                janeiro: 1,
                fevereiro: 2,
                março: 3,
                abril: 4,
                maio: 5,
                junho: 6,
                julho: 7,
                agosto: 8,
                setembro: 9,
                outubro: 10,
                novembro: 11,
                dezembro: 12
            };
            const monthNumber = monthNames[dataFormatada[1].toLowerCase()];
            const targetDate = moment(`${dataFormatada[0]}-${monthNumber}-${dataFormatada[2]}`);
            const currentDate = moment();
            const interval = moment.duration(currentDate.diff(targetDate));
            diasPassados = `${interval.asDays()} dia(s)`;

            rankings = $('tr th:contains("Ranking dos mais vendidos") + td').text().replace(/\([^)]+\)/g, '').split('Nº').slice(1).map(rank => rank.trim());
            const numberFormat = reviewNumber.split(' ');
            const numeroInteiro = parseInt(numberFormat[0].replace('.', ''));
            mediaVendasDia = Math.floor(numeroInteiro * 10 / interval.asDays());
        }

        const fiveStars = $('td.a-text-right.a-nowrap span.a-size-base').eq(0).text() + ' de avaliações possuem 5 estrelas';
        const fourStars = $('td.a-text-right.a-nowrap span.a-size-base').eq(1).text() + ' de avaliações possuem 4 estrelas';
        const threeStars = $('td.a-text-right.a-nowrap span.a-size-base').eq(2).text() + ' de avaliações possuem 3 estrelas';
        const twoStars = $('td.a-text-right.a-nowrap span.a-size-base').eq(3).text() + ' de avaliações possuem 2 estrelas';
        const oneStars = $('td.a-text-right.a-nowrap span.a-size-base').eq(4).text() + ' de avaliações possuem 1 estrela';
        const stars = [fiveStars, fourStars, threeStars, twoStars, oneStars];

        let offersNumber = '';

        if ($('.a-section.olp-link-widget a.a-touch-link').length > 0) {
            offersNumber = $('.a-section.olp-link-widget a.a-touch-link').text().split(' ofertas')[0].split(' ').pop() + ' vendedores';
        } else {
            offersNumber = '1 vendedor';
        }

        res.json({
            title,
            price,
            review,
            reviewNumber,
            enviado,
            vendido,
            logistica,
            minEstoque: quantidade,
            marca,
            dataEntrega,
            ASIN: asin,
            data: disponivelDesde,
            diasOnline: diasPassados,
            rankings,
            mediaVendasDia,
            stars,
            offers: offersNumber
        });
    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({ message: 'Erro ao fazer scraping.' });
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
