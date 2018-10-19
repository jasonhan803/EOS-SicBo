import React, { Component } from 'react';
import Eos from 'eosjs';
import { Layout, Icon, Message, Input, InputNumber } from 'antd';
import SicBoInfoDrawer from './SicBoInfoDrawer';
import SicBoRecords from './SicBoRecords';
import './SicBo.css';

const { Header, Content } = Layout;
const Search = Input.Search;

const network = {
    blockchain: 'eos',
    protocol: 'http',
    host: 'junglehistory.cryptolions.io',  // filter-on = *
    port: 18888,
    chainId: '038f4b0fc8ff18a4f0842a8f0564611f6e96e8535901dd45e43ac8691a1c4dca'  // jungle net
}
const contract_account = 'dicecontract';  // 合约账号

class SicBo extends Component {
    constructor(props) {
        super(props);

        this.state = {
            player_asset: {             // 记录玩家各个token的资产
                eos: '0.0000 EOS',
            },
            dice_result: {
                dice1: "X",
                dice2: "X",
                dice3: "X",
            },
            is_login: false,
            player_account: 'Login',    // 保存玩家账号，未登录时显示'Login'
            referrer: "Null",           // 推荐人
            info_visible: false,
        }

        // var
        this.bet_quantity = null;

        // eosjs和scatter句柄，将在init()中初始化
        this.eosjs = null;
        this.scatter = null;

        this.init = this.init.bind(this);
        this.getReferrer = this.getReferrer.bind(this);
        this.getPlayerAsset = this.getPlayerAsset.bind(this);
        this.getSicBoResult = this.getSicBoResult.bind(this);
    }

    init = () => {
        this.eosjs = Eos({
            httpEndpoint: `${network.protocol}://${network.host}:${network.port}`,
            chainId: network.chainId
        });

        document.addEventListener('scatterLoaded', scatterExtension => {
            this.scatter = window.scatter;
            window.scatter = null;

            if (this.scatter && this.scatter.identity) {
                const account = this.scatter.identity.accounts.find(account => account.blockchain === 'eos');
                this.setState({ player_account: account.name });
                this.setState({ is_login: true });

                this.getPlayerAsset();
            }
        });
    }

    playerLoginLogout = () => {
        if ( null === this.scatter ) {
            Message.info('Must Install Scatter First');
            return;
        }

        if ( this.state.is_login && this.scatter && this.scatter.identity ) {
            this.scatter.forgetIdentity().then(() => {
                this.setState({ is_login: false });
                this.setState({ player_account: 'Login' });

                // clean asset when logout
                this.setState({
                    player_asset: {
                        eos: '0.0000 EOS',
                    }
                });
            });
        } else if ( !this.state.is_login && this.scatter && !this.scatter.identity ) {
            this.scatter.getIdentity({ accounts: [network] }).then(() => {
                const account = this.scatter.identity.accounts.find(account => account.blockchain === 'eos');
                this.setState({ player_account: account.name });
                this.setState({ is_login: true });

                this.getPlayerAsset();
            });
        }
    }

    // 获取玩家token资产，这里只获取了eos token资产
    getPlayerAsset = () => {
        if ( !this.state.is_login || 'Login' === this.state.player_account ) {
            return;
        }

        this.eosjs.getTableRows({
            json: true,
            code: 'eosio.token',
            scope: this.state.player_account,
            table: 'accounts'
        }).then(eosBalance => {
            if ( this.state.is_login && eosBalance.rows[0] ) {  // check if is valid now
                let _player_asset = this.state.player_asset;
                _player_asset.eos = eosBalance.rows[0].balance;
                this.setState({ player_asset: _player_asset });
            }
        }).catch(e => {
            console.error(e);
        })
    }

    // 从浏览器地址获取推荐人
    getReferrer = () => {
        let reg = new RegExp("(^|&)" + "ref" + "=([^&]*)(&|$)");
        let ref = window.location.search.substr(1).match(reg);

        if ( null !== ref ) {
            this.setState({ referrer: unescape(ref[2]) });
        }
    }

    // 下注总金额
    inputQuantityChange = (value) => {
        if ( isNaN(value) || value.length <= 0 ) {
            console.log( "null" );
        } else {
            console.log( value );
            this.bet_quantity = value;
        }
    }

    // memo输入框
    inputMemoChange = (value, event) => {
        event.preventDefault();

        if ( value.length <= 0 ) {
            console.log("null");
        } else {
            console.log( value );

            // 只有登录了才转账
            if ( this.state.is_login && 'Login' !== this.state.player_account ) {
                const eos = this.scatter.eos(network, Eos, {});
                eos.transfer({
                    from: this.state.player_account,
                    to: contract_account,
                    quantity: Number(this.bet_quantity).toFixed(4) + ' EOS',
                    memo: value
                }).then(res => {
                    Message.success('SicBo Bet Success');
                    this.getSicBoResult();
                    this.dice_shaking = setInterval(() => {
                        this.setState({
                            dice_result: {
                                dice1: Math.floor(Math.random() * 5 + 1),
                                dice2: Math.floor(Math.random() * 5 + 1),
                                dice3: Math.floor(Math.random() * 5 + 1),
                            }
                        });
                    }, 150);
                }).catch(e => {
                    Message.error(JSON.parse(e).error.details[0].message);
                });
            }
        }
    }

    getSicBoResult = ( action_seq = Math.pow(2, 52) ) => {
        this.eosjs.getActions(this.state.player_account, -1, -20).then(({ actions }) => {
            let cur_action_seq = action_seq;
            let index = actions.length - 1;

            for (; index >= 0; index--) {
                let cur_action_seq = actions[index].account_action_seq;
                if ( cur_action_seq <= action_seq ) {
                    this.getSicBoResult( cur_action_seq );
                    break;
                }

                if ( actions[index].action_trace
                    && actions[index].action_trace.act
                    && actions[index].action_trace.act.account === contract_account
                    && actions[index].action_trace.act.name === 'result'
                    && actions[index].action_trace.act.data
                    && actions[index].action_trace.act.data.res
                    && actions[index].action_trace.act.data.res.player === this.state.player_account ) {
                    
                    clearInterval( this.dice_shaking );

                    const result = actions[index].action_trace.act.data.res;
                    this.setState({
                        dice_result: {
                            dice1: result.dice.dice1,
                            dice2: result.dice.dice2,
                            dice3: result.dice.dice3,
                        }
                    });
                    break;
                }
            }

            if ( index < 0 ) {
                this.getSicBoResult( cur_action_seq );
            }
        });
    }

    showInfo = () => {
        this.setState({ info_visible: true });
    }
    closeInfo = () => {
        this.setState({ info_visible: false });
    }

    componentDidMount() {
        this.init();
        this.getReferrer();
    }

    render() {

        return (
            <div>
                <Layout className='layout'>
                    <Header>
                        <a href='#' onClick={this.playerLoginLogout.bind(this)} className='login-logout'>
                            {
                                this.state.is_login === true ?
                                <span><Icon type='user'/> {this.state.player_account}</span> :
                                <span><Icon type='login'/> {this.state.player_account}</span>
                            }
                        </a>
                        <span className='player-asset'>Asset: {this.state.player_asset.eos}</span>
                        <span className='referrer'>&nbsp;&nbsp;&nbsp;&nbsp;Referrer: {this.state.referrer}</span>
                        <a href="#" className="info" onClick={this.showInfo.bind(this)}>
                            <Icon type='smile' /> Info
                        </a>
                    </Header>
                    <Content>
                        <div className='sicbo-result'>SicBo Result</div>
                        <div className='dice-result'>
                            <span>{this.state.dice_result.dice1}</span>
                            <span> 、 {this.state.dice_result.dice2}</span>
                            <span> 、 {this.state.dice_result.dice3}</span>
                        </div>
                        <div className="input-memo">
                            <InputNumber
                                placeholder="quantity"
                                step={0.5}
                                onChange={this.inputQuantityChange.bind(this)}
                            />
                            <Search
                                placeholder="r:referrer;key:quantity"
                                onSearch={this.inputMemoChange.bind(this)}
                                enterButton="Let's Go"
                            />
                            <span style={{ fontSize: "0.5em" }}> 注: 第一个框输入总金额，第二个框输入memo</span>
                        </div>
                        <SicBoRecords />
                        <SicBoInfoDrawer
                            info_visible={this.state.info_visible}
                            handleCloseInfo={this.closeInfo.bind(this)}
                        />
                    </Content>
                </Layout>
            </div>
        );
    }
}

export default SicBo;