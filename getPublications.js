const axios = require('axios');
require('dotenv').config();

async function getPublications() {
    const response = await axios.post(
        process.env.GRAPHQL_URL,
        JSON.stringify({
            query: `
                query {
                    publications(first: 10) {
                        nodes {
                            id
                            name
                        }
                    }
                }
            `,
        }), {
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN,
            }
        }
    );

    return response.data.data.publications.nodes.map(channel => ({
        publicationId: channel.id,
    }));
}

module.exports = { getPublications };