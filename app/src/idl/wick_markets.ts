/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/wick_markets.json`.
 */
export type WickMarkets = {
  "address": "336JyfBdwevzzuuQ5dy1LF5aQPatq947z6Td6111qxow",
  "metadata": {
    "name": "wickMarkets",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "adjustMargin",
      "discriminator": [
        14,
        55,
        115,
        80,
        174,
        90,
        52,
        253
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "priceUpdate"
        },
        {
          "name": "session",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "perpSide"
            }
          }
        },
        {
          "name": "add",
          "type": "bool"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "buy",
      "discriminator": [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "session",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minShares",
          "type": "u64"
        }
      ]
    },
    {
      "name": "buyTicket",
      "discriminator": [
        11,
        24,
        17,
        193,
        168,
        116,
        164,
        169
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "book",
          "writable": true
        },
        {
          "name": "ticket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  99,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "book"
              },
              {
                "kind": "account",
                "path": "book.ticketCount",
                "account": "touchBook"
              }
            ]
          }
        },
        {
          "name": "touchVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  99,
                  104,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "book"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "book"
          ]
        },
        {
          "name": "ownerToken",
          "writable": true
        },
        {
          "name": "priceUpdate"
        },
        {
          "name": "sbFeed"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "buyTicketArgs"
            }
          }
        }
      ]
    },
    {
      "name": "cancelPerpOrder",
      "discriminator": [
        172,
        79,
        207,
        17,
        243,
        214,
        242,
        198
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "orders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "account.owner",
                "account": "perpAccount"
              }
            ]
          }
        },
        {
          "name": "session",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "cancelPoolOrder",
      "discriminator": [
        151,
        176,
        91,
        178,
        182,
        171,
        25,
        39
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "market",
          "relations": [
            "position",
            "orders"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "orders",
          "writable": true
        },
        {
          "name": "session",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "market",
          "relations": [
            "position"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "ownerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimLp",
      "discriminator": [
        4,
        196,
        142,
        10,
        43,
        200,
        164,
        3
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "creatorToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimTicket",
      "discriminator": [
        122,
        229,
        144,
        167,
        42,
        113,
        16,
        220
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "ticket"
          ]
        },
        {
          "name": "book",
          "writable": true,
          "relations": [
            "ticket"
          ]
        },
        {
          "name": "ticket",
          "writable": true
        },
        {
          "name": "touchVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  99,
                  104,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "book"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "book"
          ]
        },
        {
          "name": "ownerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "closeByStop",
      "discriminator": [
        87,
        102,
        201,
        149,
        126,
        208,
        187,
        163
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "priceUpdate"
        },
        {
          "name": "stop"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "perpSide"
            }
          }
        }
      ]
    },
    {
      "name": "closePerp",
      "discriminator": [
        195,
        141,
        61,
        39,
        139,
        229,
        112,
        245
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "priceUpdate"
        },
        {
          "name": "session",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "perpSide"
            }
          }
        },
        {
          "name": "limitPrice",
          "type": "i64"
        },
        {
          "name": "fractionBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "confirmTouch",
      "discriminator": [
        254,
        236,
        205,
        91,
        121,
        119,
        211,
        38
      ],
      "accounts": [
        {
          "name": "book",
          "writable": true,
          "relations": [
            "ticket"
          ]
        },
        {
          "name": "ticket",
          "writable": true
        },
        {
          "name": "priceUpdate"
        },
        {
          "name": "sbFeed"
        }
      ],
      "args": []
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "args.marketId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "creatorToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createMarketArgs"
            }
          }
        }
      ]
    },
    {
      "name": "createTouchBook",
      "discriminator": [
        108,
        133,
        60,
        180,
        96,
        99,
        144,
        121
      ],
      "accounts": [
        {
          "name": "house",
          "writable": true,
          "signer": true
        },
        {
          "name": "market"
        },
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  99,
                  104,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "touchVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  99,
                  104,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "book"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "houseToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createBookArgs"
            }
          }
        }
      ]
    },
    {
      "name": "delegateMarket",
      "discriminator": [
        223,
        125,
        110,
        148,
        99,
        176,
        143,
        72
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                30,
                64,
                138,
                25,
                32,
                247,
                230,
                227,
                127,
                236,
                199,
                140,
                89,
                77,
                90,
                233,
                214,
                215,
                98,
                215,
                137,
                18,
                204,
                188,
                226,
                21,
                142,
                170,
                233,
                200,
                125,
                94
              ]
            }
          }
        },
        {
          "name": "delegationRecordMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "336JyfBdwevzzuuQ5dy1LF5aQPatq947z6Td6111qxow"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegatePerpAccount",
      "discriminator": [
        131,
        189,
        226,
        18,
        201,
        183,
        12,
        108
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "account"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                30,
                64,
                138,
                25,
                32,
                247,
                230,
                227,
                127,
                236,
                199,
                140,
                89,
                77,
                90,
                233,
                214,
                215,
                98,
                215,
                137,
                18,
                204,
                188,
                226,
                21,
                142,
                170,
                233,
                200,
                125,
                94
              ]
            }
          }
        },
        {
          "name": "delegationRecordAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "account"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "account"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "336JyfBdwevzzuuQ5dy1LF5aQPatq947z6Td6111qxow"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegatePerpMarket",
      "discriminator": [
        196,
        156,
        119,
        194,
        79,
        195,
        164,
        86
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                30,
                64,
                138,
                25,
                32,
                247,
                230,
                227,
                127,
                236,
                199,
                140,
                89,
                77,
                90,
                233,
                214,
                215,
                98,
                215,
                137,
                18,
                204,
                188,
                226,
                21,
                142,
                170,
                233,
                200,
                125,
                94
              ]
            }
          }
        },
        {
          "name": "delegationRecordMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataMarket",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "symbol"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "336JyfBdwevzzuuQ5dy1LF5aQPatq947z6Td6111qxow"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "symbol",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "delegatePerpOrders",
      "discriminator": [
        152,
        133,
        0,
        252,
        84,
        122,
        53,
        153
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferOrders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "orders"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                30,
                64,
                138,
                25,
                32,
                247,
                230,
                227,
                127,
                236,
                199,
                140,
                89,
                77,
                90,
                233,
                214,
                215,
                98,
                215,
                137,
                18,
                204,
                188,
                226,
                21,
                142,
                170,
                233,
                200,
                125,
                94
              ]
            }
          }
        },
        {
          "name": "delegationRecordOrders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "orders"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataOrders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "orders"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "orders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "336JyfBdwevzzuuQ5dy1LF5aQPatq947z6Td6111qxow"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegatePerpPool",
      "discriminator": [
        22,
        159,
        144,
        121,
        231,
        42,
        146,
        88
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                30,
                64,
                138,
                25,
                32,
                247,
                230,
                227,
                127,
                236,
                199,
                140,
                89,
                77,
                90,
                233,
                214,
                215,
                98,
                215,
                137,
                18,
                204,
                188,
                226,
                21,
                142,
                170,
                233,
                200,
                125,
                94
              ]
            }
          }
        },
        {
          "name": "delegationRecordPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "336JyfBdwevzzuuQ5dy1LF5aQPatq947z6Td6111qxow"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegatePoolOrders",
      "discriminator": [
        201,
        169,
        244,
        154,
        110,
        177,
        204,
        116
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "marketKey"
        },
        {
          "name": "bufferOrders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "orders"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                30,
                64,
                138,
                25,
                32,
                247,
                230,
                227,
                127,
                236,
                199,
                140,
                89,
                77,
                90,
                233,
                214,
                215,
                98,
                215,
                137,
                18,
                204,
                188,
                226,
                21,
                142,
                170,
                233,
                200,
                125,
                94
              ]
            }
          }
        },
        {
          "name": "delegationRecordOrders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "orders"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataOrders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "orders"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "orders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "marketKey"
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "336JyfBdwevzzuuQ5dy1LF5aQPatq947z6Td6111qxow"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegatePosition",
      "discriminator": [
        194,
        231,
        117,
        130,
        72,
        142,
        185,
        112
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "marketKey"
        },
        {
          "name": "bufferPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                30,
                64,
                138,
                25,
                32,
                247,
                230,
                227,
                127,
                236,
                199,
                140,
                89,
                77,
                90,
                233,
                214,
                215,
                98,
                215,
                137,
                18,
                204,
                188,
                226,
                21,
                142,
                170,
                233,
                200,
                125,
                94
              ]
            }
          }
        },
        {
          "name": "delegationRecordPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "position"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "marketKey"
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "336JyfBdwevzzuuQ5dy1LF5aQPatq947z6Td6111qxow"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "position.market",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "ownerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executePerpOrder",
      "discriminator": [
        237,
        180,
        18,
        156,
        56,
        179,
        35,
        185
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "orders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "account.owner",
                "account": "perpAccount"
              }
            ]
          }
        },
        {
          "name": "priceUpdate"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "executePoolOrder",
      "discriminator": [
        243,
        13,
        27,
        45,
        183,
        11,
        11,
        238
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position",
            "orders"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "orders",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "expireTicket",
      "discriminator": [
        157,
        15,
        116,
        148,
        212,
        48,
        57,
        121
      ],
      "accounts": [
        {
          "name": "book",
          "writable": true,
          "relations": [
            "ticket"
          ]
        },
        {
          "name": "ticket",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "fundHouse",
      "discriminator": [
        175,
        231,
        49,
        44,
        144,
        102,
        41,
        69
      ],
      "accounts": [
        {
          "name": "house",
          "signer": true,
          "relations": [
            "book"
          ]
        },
        {
          "name": "book",
          "writable": true
        },
        {
          "name": "touchVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  99,
                  104,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "book"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "book"
          ]
        },
        {
          "name": "houseToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initPerpMarket",
      "discriminator": [
        150,
        115,
        81,
        59,
        24,
        190,
        25,
        227
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "pool"
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "perpMarketArgs"
            }
          }
        }
      ]
    },
    {
      "name": "initPerpPool",
      "discriminator": [
        200,
        177,
        17,
        77,
        29,
        123,
        147,
        110
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "liquidatePerp",
      "discriminator": [
        75,
        35,
        119,
        247,
        191,
        18,
        139,
        2
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "priceUpdate"
        },
        {
          "name": "sbFeed"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "perpSide"
            }
          }
        }
      ]
    },
    {
      "name": "lpDeposit",
      "discriminator": [
        27,
        77,
        210,
        69,
        12,
        43,
        148,
        16
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "session",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "lpWithdraw",
      "discriminator": [
        205,
        206,
        130,
        170,
        173,
        51,
        11,
        169
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "session",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        }
      ]
    },
    {
      "name": "openPerp",
      "discriminator": [
        12,
        111,
        61,
        24,
        137,
        92,
        68,
        218
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "priceUpdate"
        },
        {
          "name": "session",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "perpSide"
            }
          }
        },
        {
          "name": "collateral",
          "type": "u64"
        },
        {
          "name": "leverageX10",
          "type": "u16"
        },
        {
          "name": "limitPrice",
          "type": "i64"
        }
      ]
    },
    {
      "name": "openPerpAccount",
      "discriminator": [
        233,
        216,
        61,
        68,
        92,
        199,
        46,
        51
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "openPerpOrders",
      "discriminator": [
        12,
        207,
        69,
        244,
        231,
        152,
        112,
        140
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "orders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "openPoolOrders",
      "discriminator": [
        44,
        89,
        183,
        240,
        46,
        180,
        90,
        88
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market"
        },
        {
          "name": "orders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "openPosition",
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market"
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "perpDeposit",
      "discriminator": [
        92,
        29,
        29,
        118,
        205,
        97,
        81,
        98
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "account"
          ]
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "ownerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "perpWithdraw",
      "discriminator": [
        17,
        19,
        193,
        239,
        65,
        17,
        47,
        164
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "account"
          ]
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "ownerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "placePerpOrder",
      "discriminator": [
        69,
        161,
        93,
        202,
        120,
        126,
        76,
        185
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "orders",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  112,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "account.owner",
                "account": "perpAccount"
              }
            ]
          }
        },
        {
          "name": "session",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "kind",
          "type": {
            "defined": {
              "name": "perpOrderKind"
            }
          }
        },
        {
          "name": "marketIndex",
          "type": "u8"
        },
        {
          "name": "isLong",
          "type": "bool"
        },
        {
          "name": "trigger",
          "type": "i64"
        },
        {
          "name": "collateral",
          "type": "u64"
        },
        {
          "name": "leverageX10",
          "type": "u16"
        }
      ]
    },
    {
      "name": "placePoolOrder",
      "discriminator": [
        159,
        84,
        168,
        4,
        161,
        4,
        163,
        251
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "market",
          "relations": [
            "position",
            "orders"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "orders",
          "writable": true
        },
        {
          "name": "session",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "isYes",
          "type": "bool"
        },
        {
          "name": "isBuy",
          "type": "bool"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "limitBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "revokeSession",
      "discriminator": [
        86,
        92,
        198,
        120,
        144,
        2,
        7,
        194
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "session"
          ]
        },
        {
          "name": "session",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "sell",
      "discriminator": [
        51,
        230,
        133,
        164,
        1,
        127,
        131,
        173
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "session",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "shares",
          "type": "u64"
        },
        {
          "name": "minOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setSession",
      "discriminator": [
        156,
        135,
        126,
        111,
        184,
        206,
        194,
        141
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "session",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "key",
          "type": "pubkey"
        },
        {
          "name": "expiresAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "settleMarket",
      "discriminator": [
        193,
        153,
        95,
        216,
        166,
        6,
        144,
        217
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "priceUpdate"
        },
        {
          "name": "sbFeed"
        }
      ],
      "args": []
    },
    {
      "name": "undelegateMarket",
      "discriminator": [
        22,
        56,
        12,
        119,
        64,
        238,
        106,
        106
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "undelegatePerpAccount",
      "discriminator": [
        25,
        220,
        244,
        45,
        242,
        15,
        211,
        210
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "undelegatePosition",
      "discriminator": [
        161,
        150,
        147,
        126,
        236,
        24,
        115,
        164
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "voidMarket",
      "discriminator": [
        243,
        175,
        46,
        124,
        95,
        101,
        39,
        69
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "market",
          "relations": [
            "position"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "ownerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawHouse",
      "discriminator": [
        226,
        236,
        222,
        156,
        198,
        230,
        70,
        147
      ],
      "accounts": [
        {
          "name": "house",
          "signer": true,
          "relations": [
            "book"
          ]
        },
        {
          "name": "book",
          "writable": true
        },
        {
          "name": "touchVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  99,
                  104,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "book"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "book"
          ]
        },
        {
          "name": "houseToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "perpAccount",
      "discriminator": [
        25,
        39,
        251,
        7,
        185,
        49,
        161,
        155
      ]
    },
    {
      "name": "perpMarket",
      "discriminator": [
        10,
        223,
        12,
        44,
        107,
        245,
        55,
        247
      ]
    },
    {
      "name": "perpOrders",
      "discriminator": [
        195,
        160,
        127,
        117,
        141,
        165,
        14,
        106
      ]
    },
    {
      "name": "perpPool",
      "discriminator": [
        85,
        217,
        76,
        137,
        27,
        61,
        171,
        33
      ]
    },
    {
      "name": "poolOrders",
      "discriminator": [
        242,
        166,
        49,
        159,
        6,
        110,
        229,
        2
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "session",
      "discriminator": [
        243,
        81,
        72,
        115,
        214,
        188,
        72,
        144
      ]
    },
    {
      "name": "touchBook",
      "discriminator": [
        88,
        28,
        40,
        11,
        42,
        107,
        189,
        125
      ]
    },
    {
      "name": "touchTicket",
      "discriminator": [
        88,
        28,
        146,
        225,
        216,
        106,
        173,
        37
      ]
    }
  ],
  "events": [
    {
      "name": "liquidated",
      "discriminator": [
        231,
        57,
        55,
        75,
        0,
        170,
        246,
        68
      ]
    },
    {
      "name": "marketCreated",
      "discriminator": [
        88,
        184,
        130,
        231,
        226,
        84,
        6,
        58
      ]
    },
    {
      "name": "marketResolved",
      "discriminator": [
        89,
        67,
        230,
        95,
        143,
        106,
        199,
        202
      ]
    },
    {
      "name": "perpTradeEvent",
      "discriminator": [
        18,
        50,
        60,
        117,
        63,
        21,
        149,
        129
      ]
    },
    {
      "name": "ticketBought",
      "discriminator": [
        80,
        244,
        35,
        181,
        211,
        143,
        3,
        166
      ]
    },
    {
      "name": "touchConfirmed",
      "discriminator": [
        232,
        145,
        98,
        55,
        48,
        210,
        153,
        173
      ]
    },
    {
      "name": "tradeEvent",
      "discriminator": [
        189,
        219,
        127,
        211,
        78,
        230,
        97,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "marketNotOpen",
      "msg": "Market is not open"
    },
    {
      "code": 6001,
      "name": "expired",
      "msg": "Market has expired"
    },
    {
      "code": 6002,
      "name": "notExpired",
      "msg": "Market has not expired yet"
    },
    {
      "code": 6003,
      "name": "invalidParams",
      "msg": "Invalid market parameters"
    },
    {
      "code": 6004,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6005,
      "name": "slippage",
      "msg": "Slippage limit exceeded"
    },
    {
      "code": 6006,
      "name": "insufficientBalance",
      "msg": "Insufficient balance"
    },
    {
      "code": 6007,
      "name": "oracleMismatch",
      "msg": "Oracle account does not match the market"
    },
    {
      "code": 6008,
      "name": "oracleStale",
      "msg": "Oracle price is stale or outside the allowed window"
    },
    {
      "code": 6009,
      "name": "oracleInvalid",
      "msg": "Oracle price is invalid"
    },
    {
      "code": 6010,
      "name": "touchNotConfirmed",
      "msg": "Both oracles must confirm the touch"
    },
    {
      "code": 6011,
      "name": "houseCapacity",
      "msg": "House reserve cannot back this ticket"
    },
    {
      "code": 6012,
      "name": "ticketState",
      "msg": "Ticket is not in the required state"
    },
    {
      "code": 6013,
      "name": "nothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6014,
      "name": "alreadyClaimed",
      "msg": "Already claimed"
    },
    {
      "code": 6015,
      "name": "voidTooEarly",
      "msg": "Void delay has not elapsed"
    },
    {
      "code": 6016,
      "name": "unauthorized",
      "msg": "Unauthorized"
    }
  ],
  "types": [
    {
      "name": "buyTicketArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "touchKind"
              }
            }
          },
          {
            "name": "barrier",
            "type": "i64"
          },
          {
            "name": "barrier2",
            "type": "i64"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "maxPriceBps",
            "docs": [
              "Reject if the quote is worse (higher) than this."
            ],
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "createBookArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "volBps",
            "type": "u32"
          },
          {
            "name": "marginBps",
            "type": "u16"
          },
          {
            "name": "maxPayout",
            "type": "u64"
          },
          {
            "name": "funding",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "createMarketArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": "u64"
          },
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "oracle",
            "type": {
              "defined": {
                "name": "oracleSpec"
              }
            }
          },
          {
            "name": "strike",
            "type": "i64"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "liquidity",
            "docs": [
              "USDC the creator seeds into the pool; mints this many YES and NO shares."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "liquidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "perpSide"
              }
            }
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "pyth",
            "type": "i64"
          },
          {
            "name": "switchboard",
            "type": "i64"
          },
          {
            "name": "refund",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "market",
      "docs": [
        "\"Will <asset> be >= strike at expiry?\" — traded through a YES/NO pool on the ER."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "u64"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "oracle",
            "type": {
              "defined": {
                "name": "oracleSpec"
              }
            }
          },
          {
            "name": "strike",
            "type": "i64"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "outcome",
            "type": {
              "option": {
                "defined": {
                  "name": "side"
                }
              }
            }
          },
          {
            "name": "yesReserve",
            "docs": [
              "FPMM reserves (shares held by the pool)."
            ],
            "type": "u64"
          },
          {
            "name": "noReserve",
            "type": "u64"
          },
          {
            "name": "feesAccrued",
            "type": "u64"
          },
          {
            "name": "lpClaimed",
            "type": "bool"
          },
          {
            "name": "volume",
            "type": "u64"
          },
          {
            "name": "settlePyth",
            "type": "i64"
          },
          {
            "name": "settleSb",
            "type": "i64"
          },
          {
            "name": "resolvedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "strike",
            "type": "i64"
          },
          {
            "name": "expiry",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "outcome",
            "type": {
              "option": {
                "defined": {
                  "name": "side"
                }
              }
            }
          },
          {
            "name": "pyth",
            "type": "i64"
          },
          {
            "name": "switchboard",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "settled"
          },
          {
            "name": "frozen"
          },
          {
            "name": "voided"
          }
        ]
      }
    },
    {
      "name": "oracleSpec",
      "docs": [
        "Oracle configuration shared by the market and its touch book."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pythFeedId",
            "docs": [
              "Pyth price feed id (hex feed id, 32 bytes)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pythAccount",
            "docs": [
              "Pyth push-feed account (monotonic, latest price only) used for quotes and settlement."
            ],
            "type": "pubkey"
          },
          {
            "name": "sbFeed",
            "docs": [
              "Switchboard canonical OracleQuote account for the feed hash."
            ],
            "type": "pubkey"
          },
          {
            "name": "maxDevBps",
            "docs": [
              "Max relative gap between the two oracles before they are treated as disagreeing."
            ],
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "perpAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "credit",
            "docs": [
              "Free USDC, usable as collateral or for LP deposits."
            ],
            "type": "u64"
          },
          {
            "name": "lpShares",
            "type": "u64"
          },
          {
            "name": "slots",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "slot"
                  }
                },
                6
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "perpMarket",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "index",
            "docs": [
              "Slot index base: this market uses slots index*2 (long) and index*2+1 (short)."
            ],
            "type": "u8"
          },
          {
            "name": "oracle",
            "type": {
              "defined": {
                "name": "oracleSpec"
              }
            }
          },
          {
            "name": "maxLeverage",
            "type": "u16"
          },
          {
            "name": "openFeeBps",
            "type": "u16"
          },
          {
            "name": "closeFeeBps",
            "type": "u16"
          },
          {
            "name": "maintBps",
            "docs": [
              "Maintenance margin, in bps of size."
            ],
            "type": "u16"
          },
          {
            "name": "liqFeeBps",
            "type": "u16"
          },
          {
            "name": "borrowPpmPerHour",
            "docs": [
              "Borrow fee in parts-per-million of size per hour."
            ],
            "type": "u32"
          },
          {
            "name": "maxOi",
            "type": "u64"
          },
          {
            "name": "longOi",
            "type": "u64"
          },
          {
            "name": "shortOi",
            "type": "u64"
          },
          {
            "name": "borrowIdx",
            "type": "u128"
          },
          {
            "name": "lastUpdate",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "perpMarketArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "oracle",
            "type": {
              "defined": {
                "name": "oracleSpec"
              }
            }
          },
          {
            "name": "maxLeverage",
            "type": "u16"
          },
          {
            "name": "openFeeBps",
            "type": "u16"
          },
          {
            "name": "closeFeeBps",
            "type": "u16"
          },
          {
            "name": "maintBps",
            "type": "u16"
          },
          {
            "name": "liqFeeBps",
            "type": "u16"
          },
          {
            "name": "borrowPpmPerHour",
            "type": "u32"
          },
          {
            "name": "maxOi",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "perpOrder",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "perpOrderKind"
              }
            }
          },
          {
            "name": "marketIndex",
            "type": "u8"
          },
          {
            "name": "isLong",
            "type": "bool"
          },
          {
            "name": "trigger",
            "type": "i64"
          },
          {
            "name": "collateral",
            "docs": [
              "Escrowed collateral for limit opens."
            ],
            "type": "u64"
          },
          {
            "name": "leverageX10",
            "type": "u16"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "perpOrderKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "limitOpen"
          },
          {
            "name": "takeProfit"
          },
          {
            "name": "stopLoss"
          }
        ]
      }
    },
    {
      "name": "perpOrders",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "orders",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "perpOrder"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "perpPool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "liquidity",
            "docs": [
              "LP-owned USDC (includes fees and trader losses, net of trader profits)."
            ],
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "Max profit the pool has promised to open positions."
            ],
            "type": "u64"
          },
          {
            "name": "fees",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "perpSide",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "long"
          },
          {
            "name": "short"
          }
        ]
      }
    },
    {
      "name": "perpTradeEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "perpSide"
              }
            }
          },
          {
            "name": "isOpen",
            "type": "bool"
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "pnl",
            "type": "i64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "poolOrder",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "isYes",
            "type": "bool"
          },
          {
            "name": "isBuy",
            "type": "bool"
          },
          {
            "name": "amount",
            "docs": [
              "Escrowed USDC (buys) or shares (sells)."
            ],
            "type": "u64"
          },
          {
            "name": "limitBps",
            "docs": [
              "Buy: fill when the side trades at or below this; sell: at or above. In bps (¢ × 100)."
            ],
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "poolOrders",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "orders",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "poolOrder"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "position",
      "docs": [
        "A trader's pool account for one market. Holds internal USDC credit plus shares so",
        "that trades can run on the ephemeral rollup without token transfers."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "yes",
            "type": "u64"
          },
          {
            "name": "no",
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "priceFeedMessage",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "docs": [
              "`FeedId` but avoid the type alias because of compatibility issues with Anchor's `idl-build` feature."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "conf",
            "type": "u64"
          },
          {
            "name": "exponent",
            "type": "i32"
          },
          {
            "name": "publishTime",
            "docs": [
              "The timestamp of this price update in seconds"
            ],
            "type": "i64"
          },
          {
            "name": "prevPublishTime",
            "docs": [
              "The timestamp of the previous price update. This field is intended to allow users to",
              "identify the single unique price update for any moment in time:",
              "for any time t, the unique update is the one such that prev_publish_time < t <= publish_time.",
              "",
              "Note that there may not be such an update while we are migrating to the new message-sending logic,",
              "as some price updates on pythnet may not be sent to other chains (because the message-sending",
              "logic may not have triggered). We can solve this problem by making the message-sending mandatory",
              "(which we can do once publishers have migrated over).",
              "",
              "Additionally, this field may be equal to publish_time if the message is sent on a slot where",
              "where the aggregation was unsuccesful. This problem will go away once all publishers have",
              "migrated over to a recent version of pyth-agent."
            ],
            "type": "i64"
          },
          {
            "name": "emaPrice",
            "type": "i64"
          },
          {
            "name": "emaConf",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceUpdateV2",
      "docs": [
        "A price update account. This account is used by the Pyth Receiver program to store a verified price update from a Pyth price feed.",
        "It contains:",
        "- `write_authority`: The write authority for this account. This authority can close this account to reclaim rent or update the account to contain a different price update.",
        "- `verification_level`: The [`VerificationLevel`] of this price update. This represents how many Wormhole guardian signatures have been verified for this price update.",
        "- `price_message`: The actual price update.",
        "- `posted_slot`: The slot at which this price update was posted."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "writeAuthority",
            "type": "pubkey"
          },
          {
            "name": "verificationLevel",
            "type": {
              "defined": {
                "name": "verificationLevel"
              }
            }
          },
          {
            "name": "priceMessage",
            "type": {
              "defined": {
                "name": "priceFeedMessage"
              }
            }
          },
          {
            "name": "postedSlot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "session",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "key",
            "type": "pubkey"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "yes"
          },
          {
            "name": "no"
          }
        ]
      }
    },
    {
      "name": "slot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "size",
            "docs": [
              "Notional in USDC base units (0 = empty)."
            ],
            "type": "u64"
          },
          {
            "name": "collateral",
            "type": "u64"
          },
          {
            "name": "entryPrice",
            "type": "i64"
          },
          {
            "name": "borrowIdx",
            "type": "u128"
          },
          {
            "name": "reserve",
            "docs": [
              "Profit the pool reserved for this position."
            ],
            "type": "u64"
          },
          {
            "name": "openedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "ticketBought",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "ticket",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "touchKind"
              }
            }
          },
          {
            "name": "barrier",
            "type": "i64"
          },
          {
            "name": "barrier2",
            "type": "i64"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "priceBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "ticketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "won"
          },
          {
            "name": "lost"
          },
          {
            "name": "claimed"
          }
        ]
      }
    },
    {
      "name": "touchBook",
      "docs": [
        "House book for touch tickets. Lives on the base layer next to its market so the",
        "market can sit on the ER. Every ticket reserves its full payout when bought."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "house",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": {
              "defined": {
                "name": "oracleSpec"
              }
            }
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "volBps",
            "docs": [
              "Annualised volatility used for pricing, in bps (6_000 = 60%)."
            ],
            "type": "u32"
          },
          {
            "name": "marginBps",
            "docs": [
              "House edge on top of fair probability, in bps."
            ],
            "type": "u16"
          },
          {
            "name": "maxPayout",
            "docs": [
              "Max payout a single ticket may lock, in USDC base units."
            ],
            "type": "u64"
          },
          {
            "name": "free",
            "docs": [
              "House capital not backing any ticket."
            ],
            "type": "u64"
          },
          {
            "name": "locked",
            "docs": [
              "Payouts reserved for open tickets (stakes included)."
            ],
            "type": "u64"
          },
          {
            "name": "ticketCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "touchConfirmed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ticket",
            "type": "pubkey"
          },
          {
            "name": "won",
            "type": "bool"
          },
          {
            "name": "pyth",
            "type": "i64"
          },
          {
            "name": "switchboard",
            "type": "i64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "touchKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "up"
          },
          {
            "name": "down"
          },
          {
            "name": "upBeforeDown"
          }
        ]
      }
    },
    {
      "name": "touchTicket",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "touchKind"
              }
            }
          },
          {
            "name": "barrier",
            "type": "i64"
          },
          {
            "name": "barrier2",
            "type": "i64"
          },
          {
            "name": "spot",
            "type": "i64"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "priceBps",
            "docs": [
              "Quoted probability incl. margin, bps."
            ],
            "type": "u16"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "ticketStatus"
              }
            }
          },
          {
            "name": "hitPyth",
            "type": "i64"
          },
          {
            "name": "hitSb",
            "type": "i64"
          },
          {
            "name": "hitAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tradeEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "isBuy",
            "type": "bool"
          },
          {
            "name": "collateral",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "yesPriceBps",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "verificationLevel",
      "docs": [
        "Pyth price updates are bridged to all blockchains via Wormhole.",
        "Using the price updates on another chain requires verifying the signatures of the Wormhole guardians.",
        "The usual process is to check the signatures for two thirds of the total number of guardians, but this can be cumbersome on Solana because of the transaction size limits,",
        "so we also allow for partial verification.",
        "",
        "This enum represents how much a price update has been verified:",
        "- If `Full`, we have verified the signatures for two thirds of the current guardians.",
        "- If `Partial`, only `num_signatures` guardian signatures have been checked.",
        "",
        "# Warning",
        "Using partially verified price updates is dangerous, as it lowers the threshold of guardians that need to collude to produce a malicious price update."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "partial",
            "fields": [
              {
                "name": "numSignatures",
                "type": "u8"
              }
            ]
          },
          {
            "name": "full"
          }
        ]
      }
    }
  ]
};
