const axios = require('axios');
require('dotenv').config();

async function getLocationId() {
    const response = await axios.post(
        process.env.GRAPHQL_URL,
        JSON.stringify({
            query: `
                query {
                    locations(first: 10) {
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

    return response.data.data.locations.nodes[0].id;
}

module.exports = { getLocationId };