import React, { Component, Fragment } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

import ViewSwitcherComponent from './components/view-switcher/view.switcher.component.js';
import SubItemsListComponent from './components/sub-items-list/sub.items.list.component.js';
import Popup from '../common/popup/popup.component';
import ActionButton from './components/action-btn/action.btn.js';
import PaginationComponent from './components/pagination/pagination.component.js';
import NoItemsComponent from './components/no-items/no.items.component.js';
import Icon from '../common/icon/icon.js';

import deepClone from '../common/helpers/deep.clone.helper.js';
import { updateLocationPriority, loadLocation, loadContentInfo, loadContentType, loadContentTypes } from './services/sub.items.service';
import {
    bulkAddLocations,
    bulkDeleteItems,
    bulkHideLocations,
    bulkUnhideLocations,
    bulkMoveLocations
} from './services/bulk.service.js';

const ASCENDING_SORT_ORDER = 'ascending';
const DESCENDING_SORT_ORDER = 'descending';
const DEFAULT_SORT_ORDER = ASCENDING_SORT_ORDER;
const ACTION_FLOW_ADD_LOCATIONS = 'add';
const ACTION_FLOW_MOVE = 'move';

export default class SubItemsModule extends Component {
    constructor(props) {
        super(props);

        this.afterPriorityUpdated = this.afterPriorityUpdated.bind(this);
        this.loadContentItems = this.loadContentItems.bind(this);
        this.loadContentTypes = this.loadContentTypes.bind(this);
        this.updateItemsState = this.updateItemsState.bind(this);
        this.switchView = this.switchView.bind(this);
        this.handleItemPriorityUpdate = this.handleItemPriorityUpdate.bind(this);
        this.toggleItemSelection = this.toggleItemSelection.bind(this);
        this.toggleAllPageItemsSelection = this.toggleAllPageItemsSelection.bind(this);
        this.onMoveBtnClick = this.onMoveBtnClick.bind(this);
        this.closeUdw = this.closeUdw.bind(this);
        this.onUdwConfirm = this.onUdwConfirm.bind(this);
        this.onDeleteBtnClick = this.onDeleteBtnClick.bind(this);
        this.onAddLocationsBtnClick = this.onAddLocationsBtnClick.bind(this);
        this.onHideBtnClick = this.onHideBtnClick.bind(this);
        this.onUnhideBtnClick = this.onUnhideBtnClick.bind(this);
        this.closeBulkDeletePopup = this.closeBulkDeletePopup.bind(this);
        this.closeBulkHidePopup = this.closeBulkHidePopup.bind(this);
        this.closeBulkUnhidePopup = this.closeBulkUnhidePopup.bind(this);
        this.onBulkDeletePopupConfirm = this.onBulkDeletePopupConfirm.bind(this);
        this.onBulkHidePopupConfirm = this.onBulkHidePopupConfirm.bind(this);
        this.onBulkUnhidePopupConfirm = this.onBulkUnhidePopupConfirm.bind(this);
        this.afterBulkDelete = this.afterBulkDelete.bind(this);
        this.afterBulkHide = this.afterBulkHide.bind(this);
        this.afterBulkUnhide = this.afterBulkUnhide.bind(this);
        this.changePage = this.changePage.bind(this);
        this.changeSorting = this.changeSorting.bind(this);

        this._refListViewWrapper = React.createRef();
        this.bulkActionModalContainer = null;
        this.udwContainer = null;

        const sortClauseData = this.getDefaultSortClause(props.sortClauses);

        this.state = {
            activeView: props.activeView,
            activePageItems: props.items,
            selectedItems: new Map(),
            contentTypesMap: props.contentTypesMap,
            totalCount: props.totalCount,
            offset: props.offset,
            isDuringBulkOperation: false,
            isUdwOpened: false,
            isBulkDeletePopupVisible: false,
            isBulkHidePopupVisible: false,
            isBulkUnhidePopupVisible: false,
            activePageIndex: 0,
            listViewHeight: null,
            actionFlow: null,
            sortClause: sortClauseData.name,
            sortOrder: sortClauseData.order,
        };
    }

    componentDidMount() {
        this.udwContainer = document.getElementById('react-udw');
        this.bulkActionModalContainer = document.createElement('div');
        this.bulkActionModalContainer.classList.add('m-sub-items__bulk-action-modal-container');
        document.body.appendChild(this.bulkActionModalContainer);
    }

    componentDidUpdate() {
        const { activePageIndex, activePageItems, totalCount } = this.state;
        const { limit: itemsPerPage } = this.props;
        const pagesCount = Math.ceil(totalCount / itemsPerPage);
        const pageDoesNotExist = activePageIndex > pagesCount - 1 && activePageIndex !== 0;

        if (pageDoesNotExist) {
            this.setState({
                activePageIndex: pagesCount - 1,
            });

            return;
        }

        const shouldLoadPage = !activePageItems;

        if (shouldLoadPage) {
            this.loadPage(activePageIndex);
        }
    }

    componentWillUnmount() {
        document.body.removeChild(this.bulkActionModalContainer);
    }

    getDefaultSortClause(sortClauses) {
        const objKeys = Object.keys(sortClauses);

        if (!objKeys.length) {
            return { name: null, order: null };
        }

        const name = objKeys[0];
        const order = sortClauses[name];

        return { name, order };
    }

    updateListViewHeight() {
        this.setState(() => ({
            listViewHeight: this._refListViewWrapper.current.offsetHeight,
        }));
    }

    /**
     * Loads items into the list
     *
     * @method loadPage
     * @memberof SubItemsModule
     */
    loadPage(pageIndex) {
        this.loadLocation(pageIndex)
            .then(this.loadContentItems)
            .then(this.loadContentTypes)
            .then(this.updateItemsState)
            .catch(() => {
                const errorMessage = Translator.trans(
                    /*@Desc("An error occurred while loading items in the Sub Items module")*/ 'page.loading_error.message',
                    {},
                    'sub_items'
                );

                window.eZ.helpers.notification.showErrorNotification(errorMessage);
            });
    }

    /**
     * Loads location data
     *
     * @param {Number} pageIndex
     * @method loadLocation
     * @returns {Promise}
     * @memberof SubItemsModule
     */
    loadLocation(pageIndex) {
        const { limit: itemsPerPage, loadLocation, restInfo, parentLocationId: locationId } = this.props;
        const { sortClause, sortOrder } = this.state;
        const offset = pageIndex * itemsPerPage;
        const sortClauses = {
            [sortClause]: sortOrder,
        };
        const queryConfig = { locationId, limit: itemsPerPage, sortClauses, offset };

        return new Promise((resolve) => loadLocation(restInfo, queryConfig, resolve));
    }

    /**
     * Loads content items from location
     *
     * @method loadContentItems
     * @param {Object} response query results
     * @returns {Promise}
     * @memberof SubItemsModule
     */
    loadContentItems(response) {
        const { loadContentInfo, restInfo } = this.props;

        if (!response || !response.View) {
            const invalidResponseFormatMessage = Translator.trans(
                /*@Desc("Invalid response format")*/ 'load_content_items.invalid_response_format.error.message',
                {},
                'sub_items'
            );

            throw new Error(invalidResponseFormatMessage);
        }

        const locations = response.View.Result.searchHits.searchHit;

        return new Promise((resolve) => {
            const contentIds = locations.map((item) => item.value.Location.ContentInfo.Content._id);

            loadContentInfo(restInfo, contentIds, (contentInfo) => {
                const totalCount = response.View.Result.count;

                resolve({
                    locations,
                    totalCount,
                    contentItems: contentInfo.View.Result.searchHits.searchHit.map((searchHit) => searchHit.value.Content),
                });
            });
        });
    }

    /**
     * Loads content types info
     *
     * @method loadContentTypes
     * @param {Object} itemsData
     * @returns {Promise}
     * @memberof SubItemsModule
     */
    loadContentTypes(itemsData) {
        const promises = itemsData.contentItems.map(
            (content) =>
                new Promise((resolve) => {
                    const contentTypeId = content.ContentType._href;

                    if (!this.state.contentTypesMap[contentTypeId]) {
                        this.props.loadContentType(contentTypeId, this.props.restInfo, (response) => resolve(response));
                    } else {
                        resolve({ ContentType: this.state.contentTypesMap[contentTypeId] });
                    }
                })
        );

        return Promise.all(promises).then((contentTypes) => {
            itemsData.contentTypes = contentTypes;

            return itemsData;
        });
    }

    /**
     * Updates module state by updating items list
     *
     * @method updateItemsState
     * @param {Object} responses
     * @memberof SubItemsModule
     */
    updateItemsState({ locations, contentItems, totalCount, contentTypes }) {
        const pageItems = locations.map((location) => {
            const itemLocation = location.value.Location;
            const respectiveContent = contentItems.find((content) => content._id === itemLocation.ContentInfo.Content._id);

            return {
                location: itemLocation,
                content: respectiveContent,
            };
        });

        this.setState((state) => ({
            activePageItems: pageItems,
            totalCount,
            contentTypesMap: {
                ...state.contentTypesMap,
                ...this.buildContentTypesMap(contentTypes),
            },
        }));
    }

    /**
     * Builds content types map
     *
     * @method buildContentTypesMap
     * @param {Array} contentTypes
     * @returns {Object}
     * @memberof SubItemsModule
     */
    buildContentTypesMap(contentTypes) {
        if (!contentTypes) {
            return {};
        }

        return contentTypes.reduce((total, item) => {
            total[item.ContentType._href] = item.ContentType;

            return total;
        }, {});
    }

    updateTotalCountState(totalCount) {
        this.setState(() => ({
            totalCount,
        }));
    }

    discardActivePageItems() {
        this.updateListViewHeight();
        this.setState(() => ({
            activePageItems: null,
        }));
    }

    changeSorting(sortClause) {
        this.updateListViewHeight();
        this.setState((state) => ({
            sortClause,
            sortOrder: this.getSortOrder(state.sortClause, sortClause, state.sortOrder),
            activePageItems: null,
        }));
    }

    getSortOrder(sortClause, newSortClause, currentSortOrder) {
        return newSortClause === sortClause ? this.getOppositeSortOrder(currentSortOrder) : DEFAULT_SORT_ORDER;
    }

    getOppositeSortOrder(sortOrder) {
        return sortOrder === ASCENDING_SORT_ORDER ? DESCENDING_SORT_ORDER : ASCENDING_SORT_ORDER;
    }

    /**
     * Updates item priority
     *
     * @method handleItemPriorityUpdate
     * @param {Object} data data hash containing: priority, location, token, siteaccess
     * @memberof SubItemsModule
     */
    handleItemPriorityUpdate(data) {
        this.props.updateLocationPriority({ ...data, ...this.props.restInfo }, this.afterPriorityUpdated);
    }

    /**
     * Updates module state after item's priority has been updated
     *
     * @method afterPriorityUpdated
     * @param {Object} response
     * @memberof SubItemsModule
     */
    afterPriorityUpdated(response) {
        if (this.state.sortClause === 'LocationPriority') {
            this.discardActivePageItems();
            this.refreshContentTree();
            return;
        }

        this.updateItemLocation(response.Location);
    }

    updateItemLocation(location) {
        this.setState(({ activePageItems }) => {
            const itemIndex = activePageItems.findIndex((item) => item.location.id === location.id);

            if (itemIndex === -1) {
                return null;
            }

            const item = activePageItems[itemIndex];
            const updatedItem = deepClone(item);
            const updatedPageItems = [...activePageItems];

            updatedItem.location = location;
            updatedPageItems[itemIndex] = updatedItem;

            return {
                activePageItems: updatedPageItems,
            };
        });
    }

    /**
     * Switches active view
     *
     * @method switchView
     * @param {String} activeView
     * @memberof SubItemsModule
     */
    switchView(activeView) {
        this.setState(() => ({ activeView }));
    }

    toggleItemSelection(item, isSelected) {
        const { selectedItems } = this.state;
        const updatedSelectedItems = new Map(selectedItems);
        const locationId = item.location.id;

        if (isSelected) {
            updatedSelectedItems.set(locationId, item);
        } else {
            updatedSelectedItems.delete(locationId);
        }

        this.setState(() => ({ selectedItems: updatedSelectedItems }));
    }

    toggleAllPageItemsSelection(select) {
        const { activePageItems } = this.state;

        if (select) {
            this.selectItems(activePageItems);
        } else {
            const locationsIds = activePageItems.map((item) => item.location.id);
            const locationsIdsSet = new Set(locationsIds);

            this.deselectItems(locationsIdsSet);
        }
    }

    /**
     *
     * @param {Array} itemsToSelect
     */
    selectItems(itemsToSelect) {
        const { selectedItems } = this.state;
        const newSelectedItems = itemsToSelect.map((item) => [item.location.id, item]);
        const newSelection = new Map([...selectedItems, ...newSelectedItems]);

        this.setState(() => ({ selectedItems: newSelection }));
    }

    /**
     * Deselects items with locations with provided IDs.
     *
     * @param {Set} locationsIds
     */
    deselectItems(locationsIds) {
        const { selectedItems } = this.state;
        const newSelection = new Map([...selectedItems].filter(([locationId]) => !locationsIds.has(locationId)));

        this.setState(() => ({ selectedItems: newSelection }));
    }

    deselectAllItems() {
        this.setState(() => ({ selectedItems: new Map() }));
    }

    toggleBulkOperationStatusState(isDuringBulkOperation) {
        this.setState(() => ({
            isDuringBulkOperation,
        }));
    }

    onMoveBtnClick() {
        this.setState(() => ({
            actionFlow: ACTION_FLOW_MOVE,
        }));
        this.toggleUdw(true);
    }

    onAddLocationsBtnClick() {
        this.setState(() => ({
            actionFlow: ACTION_FLOW_ADD_LOCATIONS,
        }));
        this.toggleUdw(true);
    }

    bulkMove(location) {
        this.toggleBulkOperationStatusState(true);

        const { restInfo } = this.props;
        const { selectedItems } = this.state;
        const locationsToMove = [...selectedItems.values()].map(({ location }) => location);

        bulkMoveLocations(restInfo, locationsToMove, location._href, this.afterBulkMove.bind(this, selectedItems, location));
    }

    bulkAdd(location) {
        this.toggleBulkOperationStatusState(true);

        const { restInfo } = this.props;
        const { selectedItems } = this.state;
        const itemsToAddLocationFor = [...selectedItems.values()];

        bulkAddLocations(restInfo, itemsToAddLocationFor, location._href, this.afterBulkAddLocation.bind(this, location));
    }

    afterBulkMove(selectedItems, location, movedLocations, notMovedLocations) {
        const { totalCount } = this.state;

        this.refreshContentTree();
        this.updateTotalCountState(totalCount - movedLocations.length);
        this.deselectAllItems();
        this.discardActivePageItems();

        this.toggleBulkOperationStatusState(false);

        if (notMovedLocations.length) {
            const modalTableTitle = Translator.trans(
                /*@Desc("%itemsCount% Content item(s) cannot be moved")*/
                'bulk_move.error.modal.table_title', {itemsCount: notMovedItems.length}, 'sub_items'
            );
            const notificationMessage = Translator.trans(
                /*@Desc("%notMovedCount% of the %totalCount% selected item(s) could not be moved because you do not have proper user permissions. {{ moreInformationLink }} Please contact your Administrator to obtain permissions.")*/ 'bulk_move.error.message',
                {
                    notMovedCount: notMovedLocations.length,
                    totalCount: movedLocations.length + notMovedLocations.length,
                },
                'sub_items'
            );
            const rawPlaceholdersMap = {
                moreInformationLink: Translator.trans(
                    /*@Desc("<u><a class='ez-notification-btn ez-notification-btn--show-modal'>Click here for more information.</a></u><br>")*/
                    'bulk_action.error.more_info', {}, 'sub_items'
                ),
            };

            this.handleBulkOperationFailedNotification(
                selectedItems,
                notMovedLocations,
                modalTableTitle,
                notificationMessage,
                rawPlaceholdersMap
            );
        }

        if (movedLocations.length) {
            const message = Translator.trans(
                /*@Desc("Content item(s) sent to {{ locationLink }}")*/
                'bulk_move.success.message', {}, 'sub_items'
            );
            const rawPlaceholdersMap = {
                locationLink: Translator.trans(
                    /*@Desc("<u><a href='%locationHref%'>%locationName%</a></u>")*/
                    'bulk_action.success.link_to_location',
                    {
                        locationName: eZ.helpers.text.escapeHTML(location.ContentInfo.Content.Name),
                        locationHref: this.props.generateLink(location.id),
                    },
                    'sub_items'
                ),
            };

            window.eZ.helpers.notification.showSuccessNotification(message, () => {}, rawPlaceholdersMap);
        }
    }

    afterBulkHide(successItems, failedItems) {
        this.deselectAllItems();
        this.discardActivePageItems();
        this.toggleBulkOperationStatusState(false);

        if (failedItems.length) {
            const modalTableTitle = Translator.trans(
                /*@Desc("%itemsCount% Content item(s) cannot be hidden")*/
                'bulk_hide.error.modal.table_title', {itemsCount: failedItems.length}, 'sub_items'
            );
            const notificationMessage = Translator.trans(
                /*@Desc("%failedCount% of the %totalCount% selected item(s) could not be hidden because you do not have proper user permissions. {{ moreInformationLink }} Contact your Administrator to obtain permissions.")*/
                'bulk_hide.error.message',
                {
                    failedCount: failedItems.length,
                    totalCount: successItems.length + failedItems.length,
                },
                'sub_items'
            );
            const rawPlaceholdersMap = {
                moreInformationLink: Translator.trans(
                    /*@Desc("<u><a class='ez-notification-btn ez-notification-btn--show-modal'>Click here for more information.</a></u><br>")*/
                    'bulk_action.error.more_info', {}, 'sub_items'
                ),
            };

            this.handleBulkOperationFailedNotification(failedItems, modalTableTitle, notificationMessage, rawPlaceholdersMap);
        }

        if (successItems.length) {
            const message = Translator.trans(
                /*@Desc("Location(s) hidden.")*/
                'bulk_hide.success.message', {}, 'sub_items'
            );

            window.eZ.helpers.notification.showSuccessNotification(message);
        }
    }

    afterBulkUnhide(successItems, failedItems) {
        this.deselectAllItems();
        this.discardActivePageItems();
        this.toggleBulkOperationStatusState(false);

        if (failedItems.length) {
            const modalTableTitle = Translator.trans(
                /*@Desc("%itemsCount% Location(s) cannot be revealed")*/
                'bulk_unhide.error.modal.table_title', {itemsCount: failedItems.length}, 'sub_items'
            );
            const notificationMessage = Translator.trans(
                /*@Desc("%failedCount% of the %totalCount% selected Location(s) could not be revealed because you do not have proper user permissions. {{ moreInformationLink }} Contact your Administrator to obtain permissions.")*/
                'bulk_unhide.error.message',
                {
                    failedCount: failedItems.length,
                    totalCount: successItems.length + failedItems.length,
                },
                'sub_items'
            );
            const rawPlaceholdersMap = {
                moreInformationLink: Translator.trans(
                    /*@Desc("<u><a class='ez-notification-btn ez-notification-btn--show-modal'>Click here for more information.</a></u><br>")*/
                    'bulk_action.error.more_info', {}, 'sub_items'
                ),
            };

            this.handleBulkOperationFailedNotification(failedItems, modalTableTitle, notificationMessage, rawPlaceholdersMap);
        }

        if (successItems.length) {
            const message = Translator.trans(
                /*@Desc("The selected location(s) have been revealed.")*/
                'bulk_unhide.success.message', {}, 'sub_items'
            );

            window.eZ.helpers.notification.showSuccessNotification(message);
        }
    }

    afterBulkAddLocation(location, successItems, failedItems) {
        this.deselectAllItems();
        this.discardActivePageItems();
        this.toggleBulkOperationStatusState(false);

        if (failedItems.length) {
            const modalTableTitle = Translator.trans(
                /*@Desc("%itemsCount% Location(s) cannot be added")*/
                'bulk_add_location.error.modal.table_title', {itemsCount: failedItems.length}, 'sub_items'
            );
            const notificationMessage = Translator.trans(
                /*@Desc("%failedCount% of the %totalCount% selected Locations(s) could not be added because you do not have proper user permissions. {{ moreInformationLink }} Contact your Administrator to obtain permissions.")*/
                'bulk_add_location.error.message',
                {
                    failedCount: failedItems.length,
                    totalCount: successItems.length + failedItems.length,
                },
                'sub_items'
            );
            const rawPlaceholdersMap = {
                moreInformationLink: Translator.trans(
                    /*@Desc("<u><a class='ez-notification-btn ez-notification-btn--show-modal'>Click here for more information.</a></u><br>")*/
                    'bulk_action.error.more_info', {}, 'sub_items'
                ),
            };

            this.handleBulkOperationFailedNotification(failedItems, modalTableTitle, notificationMessage, rawPlaceholdersMap);
        }

        if (successItems.length) {
            const message = Translator.trans(
                /*@Desc("Location(s) added to {{ locationLink }}.")*/
                'bulk_add_location.success.message', {}, 'sub_items'
            );
            const rawPlaceholdersMap = {
                locationLink: Translator.trans(
                    /*@Desc("<u><a href='%locationHref%'>%locationName%</a></u>")*/
                    'bulk_action.success.link_to_location',
                    {
                        locationName: eZ.helpers.text.escapeHTML(location.ContentInfo.Content.TranslatedName),
                        locationHref: this.props.generateLink(location.id),
                    },
                    'sub_items'
                ),
            };

            window.eZ.helpers.notification.showSuccessNotification(message, () => {}, rawPlaceholdersMap);
        }
    }

    toggleUdw(show) {
        this.setState(() => ({
            isUdwOpened: show,
        }));
    }

    closeUdw() {
        this.toggleUdw(false);
    }

    onUdwConfirm([selectedLocation]) {
        this.closeUdw();
        const { actionFlow } = this.state;

        if (actionFlow === ACTION_FLOW_MOVE) {
            this.bulkMove(selectedLocation);
        } else {
            this.bulkAdd(selectedLocation);
        }
    }

    renderUdw() {
        const { isUdwOpened, actionFlow } = this.state;

        if (!isUdwOpened) {
            return null;
        }

        const UniversalDiscovery = window.eZ.modules.UniversalDiscovery;
        const { restInfo, parentLocationId, udwConfigBulkMoveItems, udwConfigBulkAddLocation } = this.props;
        const { selectedItems } = this.state;
        const selectedItemsLocationsIds = [...selectedItems.values()].map(({ location }) => location.id);
        const excludedLocations = [parentLocationId, ...selectedItemsLocationsIds];
        const title = Translator.trans(/*@Desc("Choose location")*/ 'udw.choose_location.title', {}, 'sub_items');
        const udwConfig = actionFlow === ACTION_FLOW_MOVE ? udwConfigBulkMoveItems : udwConfigBulkAddLocation;
        const udwProps = {
            title,
            restInfo,
            onCancel: this.closeUdw,
            onConfirm: this.onUdwConfirm,
            canSelectContent: ({ item }, callback) => {
                callback(!excludedLocations.includes(item.id));
            },
            ...udwConfig,
        };

        return ReactDOM.createPortal(<UniversalDiscovery {...udwProps} />, this.udwContainer);
    }

    onDeleteBtnClick() {
        this.toggleBulkDeletePopup(true);
    }

    onHideBtnClick() {
        this.toggleBulkHidePopup(true);
    }

    onUnhideBtnClick() {
        this.toggleBulkUnhidePopup(true);
    }

    bulkDelete() {
        this.toggleBulkOperationStatusState(true);

        const { restInfo } = this.props;
        const { selectedItems, contentTypesMap } = this.state;
        const itemsToDelete = [...selectedItems.values()];

        bulkDeleteItems(restInfo, itemsToDelete, contentTypesMap, this.afterBulkDelete.bind(this, selectedItems));
    }

    bulkHide() {
        this.toggleBulkOperationStatusState(true);

        const { restInfo } = this.props;
        const { selectedItems } = this.state;
        const items = [...selectedItems.values()];

        bulkHideLocations(restInfo, items, this.afterBulkHide);
    }

    bulkUnhide() {
        this.toggleBulkOperationStatusState(true);

        const { restInfo } = this.props;
        const { selectedItems } = this.state;
        const items = [...selectedItems.values()];

        bulkUnhideLocations(restInfo, items, this.afterBulkUnhide);
    }

    afterBulkDelete(selectedItems, deletedLocations, notDeletedLocations) {
        const { totalCount, contentTypesMap } = this.state;
        const isUserLocation = ({ id: locationId }) => {
            const item = selectedItems.get(locationId);
            const contentType = contentTypesMap[item.content.ContentType._href];
            const contentTypeIdentifier = contentType.identifier;
            const isUserContentItem = window.eZ.adminUiConfig.userContentTypes.includes(contentTypeIdentifier);

            return isUserContentItem;
        };

        this.refreshContentTree();
        this.updateTotalCountState(totalCount - deletedLocations.length);
        this.deselectAllItems();
        this.discardActivePageItems();

        this.toggleBulkOperationStatusState(false);

        if (notDeletedLocations.length) {
            const hadUserContentItemFailed = notDeletedLocations.some(isUserLocation);
            const hadNonUserContentItemFailed = notDeletedLocations.some((location) => !isUserLocation(location));
            let modalTableTitle = null;
            let message = null;
            const rawPlaceholdersMap = {
                moreInformationLink: Translator.trans(
                    /*@Desc("<u><a class='ez-notification-btn ez-notification-btn--show-modal'>Click here for more information.</a></u><br>")*/
                    'bulk_action.error.more_info', {}, 'sub_items'
                ),
            };

            if (hadUserContentItemFailed && hadNonUserContentItemFailed) {
                modalTableTitle = Translator.trans(
                    /*@Desc("Content item(s) cannot be deleted or sent to trash (%itemsCount%)")*/ 'bulk_delete.error.modal.table_title.users_with_nonusers',
                    {
                        itemsCount: notDeletedLocations.length,
                    },
                    'sub_items'
                );
                message = Translator.trans(
                    /*@Desc("%notDeletedCount% of the %totalCount% selected item(s) could not be deleted or sent to trash because you do not have proper user permissions. {{ moreInformationLink }} Please contact your Administrator to obtain permissions.")*/ 'bulk_delete.error.message.users_with_nonusers',
                    {
                        notDeletedCount: notDeletedLocations.length,
                        totalCount: deletedLocations.length + notDeletedLocations.length,
                    },
                    'sub_items'
                );
            } else if (hadUserContentItemFailed) {
                modalTableTitle = Translator.trans(
                    /*@Desc("User(s) cannot be deleted (%itemsCount%)")*/ 'bulk_delete.error.modal.table_title.users',
                    {
                        itemsCount: notDeletedLocations.length,
                    },
                    'sub_items'
                );
                message = Translator.trans(
                    /*@Desc("%notDeletedCount% of the %totalCount% selected item(s) could not be deleted because you do not have proper user permissions. {{ moreInformationLink }} Please contact your Administrator to obtain permissions.")*/ 'bulk_delete.error.message.users',
                    {
                        notDeletedCount: notDeletedLocations.length,
                        totalCount: deletedLocations.length + notDeletedLocations.length,
                    },
                    'sub_items'
                );
            } else {
                modalTableTitle = Translator.trans(
                    /*@Desc("Content item(s) cannot be sent to trash (%itemsCount%)")*/ 'bulk_delete.error.modal.table_title.nonusers',
                    {
                        itemsCount: notDeletedLocations.length,
                    },
                    'sub_items'
                );
                message = Translator.trans(
                    /*@Desc("%notDeletedCount% of the %totalCount% selected item(s) could not be sent to trash because you do not have proper user permissions. {{ moreInformationLink }} Please contact your Administrator to obtain permissions.")*/ 'bulk_delete.error.message.nonusers',
                    {
                        notDeletedCount: notDeletedLocations.length,
                        totalCount: deletedLocations.length + notDeletedLocations.length,
                    },
                    'sub_items'
                );
            }

            this.handleBulkOperationFailedNotification(selectedItems, notDeletedLocations, modalTableTitle, message, rawPlaceholdersMap);
        } else {
            const anyUserContentItemDeleted = deletedLocations.some(isUserLocation);
            const anyNonUserContentItemDeleted = deletedLocations.some((location) => !isUserLocation(location));
            let message = null;

            if (anyUserContentItemDeleted && anyNonUserContentItemDeleted) {
                message = Translator.trans(
                    /*@Desc("The selected content item(s) have been sent to trash and the selected user(s) have been deleted.")*/ 'bulk_delete.success.message.users_with_nonusers',
                    {},
                    'sub_items'
                );
            } else if (anyUserContentItemDeleted) {
                message = Translator.trans(
                    /*@Desc("The selected user(s) have been deleted.")*/ 'bulk_delete.success.message.users',
                    {},
                    'sub_items'
                );
            } else {
                message = Translator.trans(
                    /*@Desc("The selected content item(s) have been sent to trash.")*/ 'bulk_delete.success.message.nonusers',
                    {},
                    'sub_items'
                );
            }

            window.eZ.helpers.notification.showSuccessNotification(message);
        }
    }

    toggleBulkDeletePopup(show) {
        this.setState(() => ({
            isBulkDeletePopupVisible: show,
        }));
    }

    toggleBulkHidePopup(show) {
        this.setState(() => ({
            isBulkHidePopupVisible: show,
        }));
    }

    toggleBulkUnhidePopup(show) {
        this.setState(() => ({
            isBulkUnhidePopupVisible: show,
        }));
    }

    closeBulkDeletePopup() {
        this.toggleBulkDeletePopup(false);
    }

    closeBulkHidePopup() {
        this.toggleBulkHidePopup(false);
    }

    closeBulkUnhidePopup() {
        this.toggleBulkUnhidePopup(false);
    }

    onBulkDeletePopupConfirm() {
        this.closeBulkDeletePopup();
        this.bulkDelete();
    }

    onBulkHidePopupConfirm() {
        this.closeBulkHidePopup();
        this.bulkHide();
    }

    onBulkUnhidePopupConfirm() {
        this.closeBulkUnhidePopup();
        this.bulkUnhide();
    }

    /**
     * Shows warning notification which has a button.
     * Clicking the button should cause appearance of the modal
     * with list of items, which failed to be deleted/moved.
     *
     * @param {Map} selectedItems
     * @param {Array} failedLocations
     * @param {String} modalTableTitle
     * @param {String} notificationMessage
     * @param {Object} rawPlaceholdersMap
     */
    handleBulkOperationFailedNotification(selectedItems, failedLocations, modalTableTitle, notificationMessage, rawPlaceholdersMap) {
        const { contentTypesMap } = this.state;
        const failedItemsData = failedLocations.map(({ id: locationId }) => {
            const item = selectedItems.get(locationId);
            const contentType = contentTypesMap[item.content.ContentType._href];
            const contentTypeIdentifier = contentType.identifier;
            const contentTypeName = window.eZ.adminUiConfig.contentTypeNames[contentTypeIdentifier];

            return {
                contentTypeName,
                contentName: item.content.TranslatedName,
            };
        });

        window.eZ.helpers.notification.showWarningNotification(
            notificationMessage,
            (notificationNode) => {
                const showModalBtn = notificationNode.querySelector('.ez-notification-btn--show-modal');

                if (!showModalBtn) {
                    return;
                }

                showModalBtn.addEventListener('click', this.props.showBulkActionFailedModal.bind(null, modalTableTitle, failedItemsData));
            },
            rawPlaceholdersMap
        );
    }

    refreshContentTree() {
        document.body.dispatchEvent(new CustomEvent('ez-content-tree-refresh'));
    }

    renderDeleteConfirmationPopupFooter(selectionInfo) {
        const cancelLabel = Translator.trans(/*@Desc("Cancel")*/ 'bulk_action.popup.cancel', {}, 'sub_items');
        const { isUserContentItemSelected, isNonUserContentItemSelected } = selectionInfo;
        let confirmLabel = '';

        if (!isUserContentItemSelected && isNonUserContentItemSelected) {
            confirmLabel = Translator.trans(/*@Desc("Send to trash")*/ 'bulk_delete.popup.confirm.nonusers', {}, 'sub_items');
        } else {
            confirmLabel = Translator.trans(/*@Desc("Delete")*/ 'bulk_delete.popup.confirm.users_and_users_with_nonusers', {}, 'sub_items');
        }

        return (
            <Fragment>
                <button
                    onClick={this.closeBulkDeletePopup}
                    type="button"
                    className="btn btn-dark"
                    data-dismiss="modal">
                    {cancelLabel}
                </button>
                <button onClick={this.onBulkDeletePopupConfirm} type="button" className="btn btn-danger font-weight-bold btn--trigger">
                    {confirmLabel}
                </button>
            </Fragment>
        );
    }

    renderHideConfirmationPopupFooter() {
        const cancelLabel = Translator.trans(/*@Desc("Cancel")*/ 'bulk_action.popup.cancel', {}, 'sub_items');
        const confirmLabel = Translator.trans(/*@Desc("Hide")*/ 'bulk_hide.popup.confirm', {}, 'sub_items');

        return (
            <Fragment>
                <button
                    onClick={this.closeBulkHidePopup}
                    type="button"
                    className="btn btn-dark"
                    data-dismiss="modal">
                    {cancelLabel}
                </button>
                <button onClick={this.onBulkHidePopupConfirm} type="button" className="btn btn-danger font-weight-bold btn--trigger">
                    {confirmLabel}
                </button>
            </Fragment>
        );
    }

    renderUnhideConfirmationPopupFooter() {
        const cancelLabel = Translator.trans(/*@Desc("Cancel")*/ 'bulk_action.popup.cancel', {}, 'sub_items');
        const confirmLabel = Translator.trans(/*@Desc("Reveal")*/ 'bulk_unhide.popup.confirm', {}, 'sub_items');

        return (
            <Fragment>
                <button
                    onClick={this.closeBulkUnhidePopup}
                    type="button"
                    className="btn btn-dark"
                    data-dismiss="modal">
                    {cancelLabel}
                </button>
                <button onClick={this.onBulkUnhidePopupConfirm} type="button" className="btn btn-danger font-weight-bold btn--trigger">
                    {confirmLabel}
                </button>
            </Fragment>
        );
    }

    getSelectionInfo() {
        const { contentTypesMap } = this.props;
        const { selectedItems } = this.state;
        let isUserContentItemSelected = false;
        let isNonUserContentItemSelected = false;

        for (const [locationId, { content }] of selectedItems) {
            if (isUserContentItemSelected && isNonUserContentItemSelected) {
                break;
            }

            const contentType = contentTypesMap[content.ContentType._href];
            const contentTypeIdentifier = contentType.identifier;
            const isUserContentItem = window.eZ.adminUiConfig.userContentTypes.includes(contentTypeIdentifier);

            if (isUserContentItem) {
                isUserContentItemSelected = true;
            } else {
                isNonUserContentItemSelected = true;
            }
        }

        return {
            isUserContentItemSelected,
            isNonUserContentItemSelected,
        };
    }

    renderDeleteConfirmationPopup() {
        const { isBulkDeletePopupVisible } = this.state;

        if (!isBulkDeletePopupVisible) {
            return null;
        }

        const confirmationMessageUsers = Translator.trans(
            /*@Desc("Are you sure you want to delete the selected user(s)?")*/ 'bulk_delete.popup.message.users',
            {},
            'sub_items'
        );
        const confirmationMessageNonUsers = Translator.trans(
            /*@Desc("Are you sure you want to send the selected content item(s) to trash?")*/ 'bulk_delete.popup.message.nonusers',
            {},
            'sub_items'
        );
        const confirmationMessageUsersAndNonUsers = Translator.trans(
            /*@Desc("Are you sure you want to delete the selected user(s) and send the other selected content item(s) to trash?")*/ 'bulk_delete.popup.message.users_with_nonusers',
            {},
            'sub_items'
        );
        const selectionInfo = this.getSelectionInfo();
        const { isUserContentItemSelected, isNonUserContentItemSelected } = selectionInfo;
        let confirmationMessage = '';

        if (isUserContentItemSelected && isNonUserContentItemSelected) {
            confirmationMessage = confirmationMessageUsersAndNonUsers;
        } else if (isUserContentItemSelected) {
            confirmationMessage = confirmationMessageUsers;
        } else {
            confirmationMessage = confirmationMessageNonUsers;
        }

        return ReactDOM.createPortal(
            <Popup
                onClose={this.closeBulkDeletePopup}
                isVisible={isBulkDeletePopupVisible}
                isLoading={false}
                size="medium"
                footerChildren={this.renderDeleteConfirmationPopupFooter(selectionInfo)}
                noHeader={true}>
                <div className="m-sub-items__confirmation-modal-body">{confirmationMessage}</div>
            </Popup>,
            this.bulkActionModalContainer
        );
    }

    renderHideConfirmationPopup() {
        const { isBulkHidePopupVisible } = this.state;

        if (!isBulkHidePopupVisible) {
            return null;
        }

        const confirmationMessage = Translator.trans(
            /*@Desc("Are you sure you want to hide the selected Location(s)?")*/
            'bulk_hide.popup.message', {}, 'sub_items'
        );

        return ReactDOM.createPortal(
            <Popup
                onClose={this.closeBulkHidePopup}
                isVisible={isBulkHidePopupVisible}
                isLoading={false}
                size="medium"
                footerChildren={this.renderHideConfirmationPopupFooter()}
                noHeader={true}>
                <div className="m-sub-items__confirmation-modal-body">{confirmationMessage}</div>
            </Popup>,
            this.bulkActionModalContainer
        );
    }

    renderUnhideConfirmationPopup() {
        const { isBulkUnhidePopupVisible } = this.state;

        if (!isBulkUnhidePopupVisible) {
            return null;
        }

        const confirmationMessage = Translator.trans(
            /*@Desc("Are you sure you want to reveal the selected Location(s)?")*/
            'bulk_unhide.popup.message', {}, 'sub_items'
        );

        return ReactDOM.createPortal(
            <Popup
                onClose={this.closeBulkHidePopup}
                isVisible={isBulkUnhidePopupVisible}
                isLoading={false}
                size="medium"
                footerChildren={this.renderUnhideConfirmationPopupFooter()}
                noHeader={true}>
                <div className="m-sub-items__confirmation-modal-body">{confirmationMessage}</div>
            </Popup>,
            this.bulkActionModalContainer
        );
    }

    changePage(pageIndex) {
        this.updateListViewHeight();
        this.setState(() => ({
            activePageIndex: pageIndex,
            activePageItems: null,
        }));
    }

    getPageSelectedLocationsIds() {
        const { selectedItems, activePageItems } = this.state;
        const selectedLocationsIds = [...selectedItems.keys()];
        const pageLocationsIds = [...activePageItems.map((item) => item.location.id)];
        const selectedPageLocationsIds = new Set(pageLocationsIds.filter((locationId) => selectedLocationsIds.includes(locationId)));

        return selectedPageLocationsIds;
    }

    /**
     * Renders extra actions
     *
     * @method renderExtraActions
     * @param {Object} action
     * @returns {JSX.Element}
     * @memberof SubItemsModule
     */
    renderExtraActions(action, index) {
        const Action = action.component;

        return <Action key={index} className="m-sub-items__action" {...action.attrs} />;
    }

    /**
     * Renders pagination info,
     * which is information about how many items of all user is
     * viewing at the moment
     *
     * @method renderPaginationInfo
     * @returns {JSX.Element}
     */
    renderPaginationInfo() {
        const { totalCount, activePageItems } = this.state;
        const viewingCount = activePageItems ? activePageItems.length : 0;

        const message = Translator.trans(
            /*@Desc("Viewing <strong>%viewingCount%</strong> out of <strong>%totalCount%</strong> sub-items")*/ 'viewing_message',
            {
                viewingCount,
                totalCount,
            },
            'sub_items'
        );

        return <div className="m-sub-items__pagination-info" dangerouslySetInnerHTML={{ __html: message }} />;
    }

    /**
     * Renders pagination
     *
     * @method renderPagination
     * @returns {JSX.Element|null}
     * @memberof SubItemsModule
     */
    renderPagination() {
        const { limit: itemsPerPage } = this.props;
        const { totalCount } = this.state;
        const lessThanOnePage = totalCount <= itemsPerPage;

        if (lessThanOnePage) {
            return null;
        }

        const { activePageIndex, activePageItems, isDuringBulkOperation } = this.state;
        const isActivePageLoaded = !!activePageItems;
        const isPaginationDisabled = !isActivePageLoaded || isDuringBulkOperation;

        return (
            <PaginationComponent
                proximity={1}
                itemsPerPage={itemsPerPage}
                activePageIndex={activePageIndex}
                totalCount={totalCount}
                onPageChange={this.changePage}
                disabled={isPaginationDisabled}
            />
        );
    }

    renderBulkMoveBtn(disabled) {
        const label = Translator.trans(/*@Desc("Move selected items")*/ 'move_btn.label', {}, 'sub_items');

        return <ActionButton disabled={disabled} onClick={this.onMoveBtnClick} label={label} type="move" />;
    }

    renderBulkAddLocationBtn(disabled) {
        const label = Translator.trans(/*@Desc("Add Locations to selected Content item(s)")*/ 'add_locations_btn.label', {}, 'sub_items');

        return <ActionButton disabled={disabled} onClick={this.onAddLocationsBtnClick} label={label} type="create-location" />;
    }

    renderBulkHideBtn(disabled) {
        const label = Translator.trans(/*@Desc("Hide selected Locations")*/ 'hide_locations_btn.label', {}, 'sub_items');

        return <ActionButton disabled={disabled} onClick={this.onHideBtnClick} label={label} type="hide" />;
    }

    renderBulkUnhideBtn(disabled) {
        const label = Translator.trans(/*@Desc("Reveal selected Locations")*/ 'unhide_locations_btn.label', {}, 'sub_items');

        return <ActionButton disabled={disabled} onClick={this.onUnhideBtnClick} label={label} type="reveal" />;
    }

    renderBulkDeleteBtn(disabled) {
        const label = Translator.trans(/*@Desc("Delete selected items")*/ 'trash_btn.label', {}, 'sub_items');

        return <ActionButton disabled={disabled} onClick={this.onDeleteBtnClick} label={label} type="trash" />;
    }

    renderSpinner() {
        const { activePageItems } = this.state;
        const isActivePageLoaded = !!activePageItems;

        if (isActivePageLoaded) {
            return null;
        }

        const { listViewHeight } = this.state;
        const spinnerMinHeight = 90;
        const style = {
            height: listViewHeight && listViewHeight > spinnerMinHeight ? listViewHeight : spinnerMinHeight,
        };

        return (
            <div style={style}>
                <div className="m-sub-items__spinner-wrapper">
                    <Icon name="spinner" extraClasses="m-sub-items__spinner ez-icon--medium ez-spin" />
                </div>
            </div>
        );
    }

    renderNoItems() {
        if (this.state.totalCount) {
            return null;
        }

        return <NoItemsComponent />;
    }

    renderListView() {
        const { activePageItems, sortClause, sortOrder } = this.state;
        const pageLoaded = !!activePageItems;

        if (!pageLoaded) {
            return null;
        }

        const selectedPageLocationsIds = this.getPageSelectedLocationsIds();

        return (
            <SubItemsListComponent
                activeView={this.state.activeView}
                contentTypesMap={this.state.contentTypesMap}
                handleItemPriorityUpdate={this.handleItemPriorityUpdate}
                items={activePageItems}
                languages={this.props.languages}
                handleEditItem={this.props.handleEditItem}
                generateLink={this.props.generateLink}
                onItemSelect={this.toggleItemSelection}
                toggleAllItemsSelect={this.toggleAllPageItemsSelection}
                selectedLocationsIds={selectedPageLocationsIds}
                onSortChange={this.changeSorting}
                sortClause={sortClause}
                sortOrder={sortOrder}
            />
        );
    }

    render() {
        const listTitle = Translator.trans(/*@Desc("Sub-items")*/ 'items_list.title', {}, 'sub_items');
        const { selectedItems, activeView, totalCount, isDuringBulkOperation, activePageItems } = this.state;
        const nothingSelected = !selectedItems.size;
        const isTableViewActive = activeView === 'table';
        const pageLoaded = !!activePageItems;
        const bulkBtnDisabled = nothingSelected || !isTableViewActive || !pageLoaded;
        let bulkHideBtnDisabled = true;
        let bulkUnhideBtnDisabled = true;
        let listClassName = 'm-sub-items__list';

        if (isDuringBulkOperation) {
            listClassName = `${listClassName} ${listClassName}--processing`;
        }

        if (!bulkBtnDisabled) {
            const selectedItemsValues = [...selectedItems.values()];

            bulkHideBtnDisabled = !selectedItemsValues.some(item => !item.hidden);
            bulkUnhideBtnDisabled = !selectedItemsValues.some(item => !!item.hidden);
        }

        return (
            <div className="m-sub-items">
                <div className="m-sub-items__header">
                    <div className="m-sub-items__title">
                        {listTitle} ({this.state.totalCount})
                    </div>
                    <div className="m-sub-items__actions">
                        {this.props.extraActions.map(this.renderExtraActions)}
                        {this.renderBulkMoveBtn(bulkBtnDisabled)}
                        {this.renderBulkAddLocationBtn(bulkBtnDisabled)}
                        {this.renderBulkHideBtn(bulkHideBtnDisabled)}
                        {this.renderBulkUnhideBtn(bulkUnhideBtnDisabled)}
                        {this.renderBulkDeleteBtn(bulkBtnDisabled)}
                    </div>
                    <ViewSwitcherComponent onViewChange={this.switchView} activeView={activeView} isDisabled={!totalCount} />
                </div>
                <div ref={this._refListViewWrapper} className={listClassName}>
                    {this.renderSpinner()}
                    {this.renderListView()}
                    {this.renderNoItems()}
                </div>
                {this.renderPaginationInfo()}
                {this.renderPagination()}
                {this.renderUdw()}
                {this.renderDeleteConfirmationPopup()}
                {this.renderHideConfirmationPopup()}
                {this.renderUnhideConfirmationPopup()}
            </div>
        );
    }
}

eZ.addConfig('modules.SubItems', SubItemsModule);

SubItemsModule.propTypes = {
    parentLocationId: PropTypes.number.isRequired,
    restInfo: PropTypes.shape({
        token: PropTypes.string.isRequired,
        siteaccess: PropTypes.string.isRequired,
    }).isRequired,
    loadContentInfo: PropTypes.func,
    loadContentType: PropTypes.func,
    loadContentTypes: PropTypes.func,
    loadLocation: PropTypes.func,
    sortClauses: PropTypes.object,
    updateLocationPriority: PropTypes.func,
    activeView: PropTypes.string,
    extraActions: PropTypes.arrayOf(
        PropTypes.shape({
            component: PropTypes.func,
            attrs: PropTypes.object,
        })
    ),
    items: PropTypes.arrayOf(PropTypes.object),
    limit: PropTypes.number,
    offset: PropTypes.number,
    handleEditItem: PropTypes.func.isRequired,
    generateLink: PropTypes.func.isRequired,
    contentTypesMap: PropTypes.object,
    totalCount: PropTypes.number,
    languages: PropTypes.object,
    udwConfigBulkMoveItems: PropTypes.object.isRequired,
    udwConfigBulkAddLocation: PropTypes.object.isRequired,
    showBulkActionFailedModal: PropTypes.func.isRequired,
};

SubItemsModule.defaultProps = {
    loadContentInfo,
    loadContentType,
    loadContentTypes,
    loadLocation,
    sortClauses: {},
    updateLocationPriority,
    activeView: 'table',
    extraActions: [],
    languages: window.eZ.adminUiConfig.languages,
    items: [],
    limit: parseInt(window.eZ.adminUiConfig.subItems.limit, 10),
    offset: 0,
    contentTypesMap: {},
    totalCount: 0,
};
